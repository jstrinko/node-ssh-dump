var fast_bindall = require('fast-bindall'),
	async = require('async'),
	fs = require('fs'),
	ssh_server = require('ssh2').Server,
	commander = require('commander'),
	_ = require('underscore');

var ssh_dump = function(options) {
	this.options = options;
	if (this.options.logger && this.options.logger.log) {
		this.log = this.options.logger.log;
	} 
	else if (this.options.logger && this.options.logger.info) {
		this.log = this.options.logger.info;
	}
	else {
		this.log = console.log;
	}
	fast_bindall(this);
};

_.extend(ssh_dump.prototype, {
	start: function(callback) {
		this.server = new ssh_server({
			privateKey: fs.readFileSync(this.options.private_key),
			passphrase: this.options.passphrase,
			banner: this.options.banner
		}, this.connect);
		this.server.listen(this.options.port, 'localhost', callback);
	},
	connect: function(client) {
		var self = this;
		client.on('authentication', this.authenticate);
		client.on('end', _.bind(this.disconnect, client));
		client.on('ready', function() {
			self.log("SSH Client Ready");
			client.on('session', function(accept, reject) {
				self.log("Session Start");
				var session = accept();
				session.on('pty', function(accept, reject, info) {
					self.log("PTY Accepted");
					console.warn(info);
					session.pty_info = info;
					var pty = accept();
					return false;
				});
				session.on('window-change', function(accept, reject, info) {
					console.warn("window change", info);
				});
				session.on('signal', function(accept, reject, info) {
					console.warn("Incoming :", info);
				});
				session.on('shell', function(accept, reject) {
					self.log("Shell Accepted");
					var channel = accept();
					var command = '';
					channel.on('data', function(chunk) {
						var str = chunk.toString();
						if (
							('\n' == str) || 
							('\r' == str) || 
							('\r\n' == str)
						) {
							channel.write('\r\n');
							self.run_command(
								{
									command: command,
									session: session,
									channel: channel,
									client: client
								}, 
								function(data) {
									command = '';
									channel.write(data + '\r\n>');
								}
							);
						}
						else {
							console.warn(chunk);
							command += str;
							channel.write(chunk);
						}
					});
					channel.write('Welcome to SSH Dumper.\r\nType "help" for commands.\r\n\r\n>');
					return false;
				});
			});
		});
	},
	run_command: function(options, callback) {
		var command = options.command;
		var parts = command.split(/\s/g);
		var app = parts[0];
		if (this.commands[app]) { 
			return this.commands[app].call(this, options, callback);
		}
		else if (app.length > 0) {
			return callback("Invalid Command");
		}
		else {
			return callback('');
		}
	},
	commands: {
		help: function(options, callback) {
			var parser = new commander.Command();
			parser.parse(options.command);
			console.warn(parser);
			return callback('\r\n' + Object.keys(this.commands).join('\r\n') + '\r\n');
		},
		exit: function(options, callback) {
			options.client.end();
		},
		ls: function(options, callback) {
			var command = options.command;
			var parts = command.split(/\s/g);
			if (parts[1]) {
				if (this.options.vars[parts[1]]) {
					this.show_keys(this.options.vars[parts[1]], callback);
				}
				else {
					return callback("Unknown Variable '" + parts[1] + "'");
				}
			}
			else {
				this.show_keys(this.options.vars, callback);
			}
		},
	},
	show_keys: function(obj, callback) {
		return callback(Object.keys(obj).join('\r\n'));
	},
	authenticate: function(ctx) {
		if (
			ctx.method === 'password' && 
			ctx.username === this.options.username &&
			ctx.password === this.options.password
		) {
			ctx.accept();
		}
		else {
			ctx.reject();
		}
	},
	disconnect: function() {
		this.log("Client Disconnected");
	},
});

module.exports = ssh_dump;
