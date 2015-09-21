var sni = require('sni');
var net = require('net');
var dns = require('dns');

var port = process.env.PORT || 443;
if (process.env.DNS) {
	dns.setServers(process.env.DNS.split(','));
}
var shutdownGrace = process.env.SHUTDOWN_GRACE || 5000;

function initSession(serverSocket, sniName) {
	if (!sniName || sniName.length == 0) {
		serverSocket.end();
		return;
	}
	dns.resolve6(sniName, function (err, addresses) {
		if (!addresses || !addresses.length) {
			serverSocket.end();
			console.log('Unable to resolve AAAA ' + sniName);
			return;
		}
		ip = addresses[0];
		clientSocket = new net.Socket({ type: 'tcp6' });
		clientSocket.connect(443, ip, function () {
			serverSocket.pipe(clientSocket).pipe(serverSocket).resume();
		});
	});
}

function interrupt() {
	server.close();
	server.getConnections(function (err, count) {
		if (!err && count) {
			console.error('Received interrupt signal.');
			setTimeout(function() {
				process.exit()
			}, shutdownGrace)
		}
	});
}

server = net.createServer(function (socket) {
	socket.once('data', function (data) {
		socket.pause();
		socket.unshift(data);
		initSession(socket, sni(data));
	});
}).listen(port, '0.0.0.0');

process.once('SIGINT', interrupt);
