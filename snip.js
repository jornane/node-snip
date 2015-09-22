var sni = require('sni-reader');
var net = require('net');
var dns = require('dns');
var log = require('npmlog')
var AsyncCache = require('async-cache');

var port = process.env.PORT || 443;
if (process.env.DNS) {
	dns.setServers(process.env.DNS.split(','));
}
var shutdownGrace = process.env.SHUTDOWN_GRACE || 5000;
log.level = process.env.LOG_LEVEL || 'info';

var dnsCache = new AsyncCache({
	max: 1000,
	maxAge: process.env.DNS_CACHE || 3600 * 1000,
	load: function (key, cb) {
		dns.resolve6(key, cb);
	}
});

function initSession(serverSocket, sniName) {
	dnsCache.get(sniName, function (err, addresses) {
		if (!addresses || !addresses.length) {
			serverSocket.end();
			log.warn(serverSocket.remoteAddress, 'sni', sniName, 'resolve', err ? err.code : null);
			return;
		}
		var ip = addresses[0];
		var clientSocket = net.connect({port: 443, type: 'tcp6', host: ip});
		log.verbose(serverSocket.remoteAddress, 'sni', sniName, 'resolved', addresses);

		clientSocket.on('connect', function () {
			serverSocket.pipe(clientSocket).pipe(serverSocket);
			log.info(serverSocket.remoteAddress, 'sni', sniName, 'proxied', ip);
		});
	});
}

var server = net.createServer(function (serverSocket) {
	sni(serverSocket, function(err, sniName) {
		if (err) throw err;
		if (sniName) {
			log.verbose(serverSocket.remoteAddress, 'sni', sniName);
			initSession(serverSocket, sniName);
		} else {
			log.warn(serverSocket.remoteAddress, 'sni', '(none)');
			serverSocket.end();
		}
	});
}).listen(port, '0.0.0.0');

process.once('SIGINT', interrupt);
function interrupt() {
	server.close();
	server.getConnections(function (err, count) {
		if (!err && count) {
			console.error('Waiting for clients to disconnect. Grace', shutdownGrace);
			setTimeout(function() {
				process.exit();
			}, shutdownGrace);
		} else if (err) {
			console.error('Error while receiving interrupt! Attempt to bail, no grace.', err);
			process.exit();
		}
	});
}
