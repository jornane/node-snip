var sni = require('sni');
var net = require('net');
var dns = require('dns');

var port = process.env.PORT;
if (!port) port = 443;

function initSession(serverSocket, hostname) {
	dns.resolve6(hostname, function (err, addresses) {
		if (!addresses || !addresses.length) {
			serverSocket.end();
			console.log('Unable to resolve AAAA ' + hostname);
			return;
		}
		ip = addresses[0];
		clientSocket = new net.Socket({ type: 'tcp6' });
		clientSocket.connect(443, ip, function () {
			serverSocket.pipe(clientSocket).pipe(serverSocket).resume();
		});
	});
}

net.createServer(function (socket) {
	socket.once('data', function (data) {
		socket.pause();
		socket.unshift(data);
		initSession(socket, sni(data));
	});
}).listen(port, '0.0.0.0');
