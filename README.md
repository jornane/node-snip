SNI Proxy
=========

The SNI Proxy, **snip** for short, is a simple TCP proxy that listens for
incoming HTTPS connections on IPv4, reads the SNI value (hostname) and proxies
the TCP connection to an IPv6 host with that hostname.  It does so without
applying any cryptography, keeping end-to-end encryption intact.


Motivation
----------

The news that IPv4 addresses are running out and that everyone should switch to
IPv6 has been around for decades.  However, there are still many end-hosts
without IPv6 connectivity, while end-hosts without IPv4 connectivity are still
scarce.  Todays best practice is therefore to run servers dual-stack, giving
them both IPv4 and IPv6 addresses, supporting IPv4-only clients while being
ready for a future where there will be IPv6-only clients.  This, however, poses
a challenge; since IPv4 addresses are scarce, the assignment of these must be
planned carefully.

A popular solution to this problem today is to exclusively use RFC1918
addresses space for backend services (no IPv6 connectivity).  A proxy server on
the network edge exposes all backend services via both IPv4 and IPv6.  Using
these IPv4-only backend networks requires that the proxy has knowledge of all
services that reside behind it, and generally requires a configuration
management infrastructure to keep track of everything.

This project seeks to provide an alternative solution to the problem.  In this
solution, the backend network is IPv6-only without private addresses.  One or
multiple proxies are assigned public IPv4 addresses.  IPv6-capable clients will
bypass the proxy entirely and address the backend server directly.  IPv4-only
clients will connect to the proxy and have their HTTPS connections forwarded to
the backend server.  The proxy requires no configuration and is designed to
"*configure and forget*".


Technical background
--------------------

When a user visits an HTTPS page, the following happens:  (1) The hostname part
of the URL is looked up in DNS and resolved to an IPv6 or IPv4 address.  (2) A
TCP connection to the IPv6 address is attempted, unless no IPv6 connectivity is
available, then IPv4 is used.  (3) A TLS handshake is attempted, which contains
an SNI header, containing the hostname part of the URL.

Since the SNI value is sent in cleartext, it can be interscepted by anything
between the server and the client without decryption or detection.  This makes
it possible to implement a proxy that receives HTTPS traffic on one IP address
and forward it to another IP address based on the SNI value.

The advantage is that one IPv4 address can serve many virtual hosts without any
configuration being necessary on the proxy.  Configuration is simply done in
DNS, which is already being done in virtually any setup.  The proxy listens on
TCP4 port 443, sniffs the SNI value and looks up the hostname's AAAA record.
It then establishes a connection to this host on TCP6 port 443.  When any
hostname is added, removed or modified, the changes in DNS will automatically
change the behaviour in the proxy.

Since the proxy functions as a TCP proxy with an IPv4 client and an IPv6 server,
the proxy must be configured with dual stack.  However, any backend server can
be configured IPv6-only or with NAT64 or with IPv4 behind NAT.  This greatly
reduces the amount of required IPv4 addresses in the network and therefore
greatly reduces the amount of resource planning required.


DNS Configuration
-----------------

Using a SNI proxy for the goal outlined in the previous paragraphs requires that
all relevant hostnames are dual-stack, with the IPv6 address of the actual
server as AAAA record and the IPv4 address of the proxy as A record.  This means
that the different hostnames have the same IPv4 address but not the same IPv6
address.  It is therefore not possible to use CNAMEs, but it is recommended to
provide a PTR for the IPv4 address to a hostname that does not resolve to IPv6.

```
snip.example.com.		86400	IN	A	192.0.2.10
snip.example.com.		86400	IN	TXT	"SNI Proxy for IPv4 only users"
```

```
10.2.0.192.in-addr.arpa.		86400	IN	PTR	snip.example.com.
```

The hostnames point to both the IPv4 address of the proxy and to the IPv6
address of their backend server.

```
www.example.com.		86400	IN	A	192.0.2.10
www.example.com.		86400	IN	AAAA	2001:DB8:443::1
shop.example.com.		86400	IN	A	192.0.2.10
shop.example.com.		86400	IN	AAAA	2001:DB8:443::2
```

```
1.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.3.4.4.0.8.b.d.0.1.0.0.2.ip6.arpa.	86400	IN	PTR	www.example.com.
2.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.3.4.4.0.8.b.d.0.1.0.0.2.ip6.arpa.	86400	IN	PTR	shop.example.com.
```


Testing
-------

Running a test proxy is easy! First start the proxy on an unprivileged port.
```sh
PORT=2443 node snip.js
```

In another shell, on the same machine, run:
```
# Should show a redirect
curl -I --resolve uninett.no:2443:127.0.0.1 https://uninett.no:2443

# Should fail, as GitHub still lives in the stone age
curl -I --resolve github.com:2443:127.0.0.1 https://github.com:2443
```
