var sni = require('sni-reader');
var net = require('net');
var dns = require('dns');
var log4js = require('log4js');
var logger = log4js.getLogger();
var AsyncCache = require('async-cache');

var port = process.env.PORT || 443;
if (process.env.DNS) {
	dns.setServers(process.env.DNS.split(','));
}
var shutdownGrace = process.env.SHUTDOWN_GRACE || 5000;
logger.setLevel(process.env.LOG_LEVEL || 'INFO');

var dnsCache = new AsyncCache({
	max: 1000,
	maxAge: process.env.DNS_CACHE || 3600 * 1000,
	load: function (key, cb) {
		logger.debug('dns', 'Looking up AAAA', key);
		dns.resolve6(key, cb);
	}
});

function initSession(serverSocket, sniName) {
	dnsCache.get(sniName, function (err, addresses) {
		if (err) {
			serverSocket.end();
			logger.warn('dns', serverSocket.remoteAddress, sniName, 'resolve', err ? err.code : null);
			return;
		}
		var ip = addresses[0];
		var clientSocket = net.connect({port: 443, type: 'tcp6', host: ip});
		logger.debug('tcp', serverSocket.remoteAddress, sniName, 'connecting', addresses);

		clientSocket.on('connect', function () {
			serverSocket.pipe(clientSocket).pipe(serverSocket);
			logger.info('tcp', serverSocket.remoteAddress, sniName, 'connected', ip);
		});
	});
}

var server = net.createServer(function (serverSocket) {
	serverSocket.on('error', function(err){
		if (err.code == 'EPIPE') {
			logger.debug('sni', serverSocket.remoteAddress, 'Client disconnected before the pipe was connected.');
		} else {
			logger.fatal('sni', err);
		}
		serverSocket.end();
	});
	sni(serverSocket, function(err, sniName) {
		if (err) {
			logger.error('sni', err.stack);
			serverSocket.end();
		} else if (sniName) {
			logger.debug('sni', serverSocket.remoteAddress, sniName);
			initSession(serverSocket, sniName);
		} else {
			logger.warn('sni', serverSocket.remoteAddress, '(none)');
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
			console.fatal('Error while receiving interrupt! Attempt to bail, no grace.', err);
			process.exit();
		}
	});
}
