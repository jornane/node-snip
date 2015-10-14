var sni = require('sni-reader');
var net = require('net');
var dns = require('dns');
var log4js = require('log4js');
var dnsLog = log4js.getLogger('dns');
var tcpLog = log4js.getLogger('tcp');
var sniLog = log4js.getLogger('sni');
var AsyncCache = require('async-cache');

var port = process.env.PORT || 443;
if (process.env.DNS) {
	dns.setServers(process.env.DNS.split(','));
}
var shutdownGrace = process.env.SHUTDOWN_GRACE || 5000;
dnsLog.setLevel(process.env.LOG_LEVEL || 'INFO');
tcpLog.setLevel(process.env.LOG_LEVEL || 'INFO');
sniLog.setLevel(process.env.LOG_LEVEL || 'INFO');

var dnsCache = new AsyncCache({
	max: 1000,
	maxAge: process.env.DNS_CACHE || 3600 * 1000,
	load: function (key, cb) {
		dnsLog.debug('Looking up AAAA', key);
		dns.resolve6(key, cb);
	}
});

function initSession(serverSocket, sniName) {
	dnsCache.get(sniName, function (err, addresses) {
		if (err) {
			serverSocket.end();
			dnsLog.warn(serverSocket.remoteAddress, sniName, 'resolve', err ? err.code : null);
			return;
		}
		var ip = addresses[0];
		var clientSocket = net.connect({port: 443, type: 'tcp6', host: ip});
		tcpLog.debug(serverSocket.remoteAddress, sniName, 'connecting', addresses);

		clientSocket.on('connect', function () {
			serverSocket.pipe(clientSocket).pipe(serverSocket);
			tcpLog.info(serverSocket.remoteAddress, sniName, 'connected', ip);
		});
	});
}

var server = net.createServer(function (serverSocket) {
	serverSocket.on('error', function(err){
		if (err.code == 'EPIPE') {
			sniLog.debug(serverSocket.remoteAddress, 'Client disconnected before the pipe was connected.');
		} else {
			sniLog.fatal(err);
		}
		serverSocket.end();
	});
	sni(serverSocket, function(err, sniName) {
		if (err) {
			sniLog.trace(err);
			serverSocket.end();
		} else if (sniName) {
			sniLog.debug(serverSocket.remoteAddress, sniName);
			initSession(serverSocket, sniName);
		} else {
			sniLog.warn(serverSocket.remoteAddress, '(none)');
			serverSocket.end();
		}
	});
}).listen(port, '0.0.0.0');
tcpLog.debug('Started listening on tcp4 port ', port);

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
			console.fatal('Error while receiving interrupt! Attempt to bail, no grace.', err);
			process.exit();
		}
	});
}
