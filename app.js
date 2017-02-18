
const appUtil = require('./util.js');

appUtil.autoUpdate();

process.on('SIGINT', () => {
	console.log('Received SIGINT.');
	shutdown();
});
process.on('SIGTERM', () => {
	console.log('Received SIGTERM.');
	shutdown();
});

/* ----------------------------------------------------------------------- */

function doReport() {
	let report = {
		host		: appUtil.hostId,
		uptime		: process.uptime(),
		sensor		: tshark.getReport(),
	};
	clientMqtt.publish('devices/report', JSON.stringify(report));
}

function doDeiviceReport(macAddress) {
	let report = {
		host		: appUtil.hostId,
		uptime		: process.uptime(),
		sensor		: tshark.getDeviceReport(macAddress),
	};
	clientMqtt.publish('devices/report', JSON.stringify(report));
}

function doList() {
	let report = {
		host		: appUtil.hostId,
		uptime		: process.uptime(),
		sensor		: tshark.getDevices(),
	};
	clientMqtt.publish('devices/report', JSON.stringify(report));
}
function cleanHistory() {
	doList();
	tshark.cleanHistory();
}


function shutdown(){
	console.log('Shutdown');
	try {
		clientMqtt.publish('ADMIN', appUtil.hostId + ' is going down.');
		clientMqtt.end();
	} catch (e){
		console.error('[Error while app MQTT shutdown]');
		console.error(e);
	}
	try {
		tshark.shutdown();
	} catch (e){
		console.error('[Error while app tshark shutdown]');
		console.error(e);
	}
}

function onNewDevice(device) {
	try {
		clientMqtt.publish(appUtil.hostId, `Got new device with MAC ${JSON.stringify(device)}`);
		console.log(`Got new device with MAC ${JSON.stringify(device)}`);
	} catch (e){
		console.error('[lost MQTT connection]');
		console.error(e);
	}
}

/* ----------------------------------------------------------------------- */

function startTshark() {
	const Tshark = require('./tshark.js');
	let tshark;
	try {
		tshark = Tshark();
		tshark.emitterInstance.on('newDevice', onNewDevice);
	} catch (e) {
		console.error('[Error while strating tshark.js]');
		console.error(e);
		clientMqtt.publish('ADMIN' , e.message);
		if (config.shutdownOnTsharkFail){
			shutdown();
		}
	}
}

/* ----------------------------------------------------------------------- */

const mqtt = require('mqtt');
const config = appUtil.loadConfig();
let clientMqtt	= mqtt.connect(`mqtt://${config.mqttHost}:${config.mqttPort}`, {
	username	: config.mqttUser,
	password	: config.mqttPwd,
	will		: {
		topic		: appUtil.hostId,
		payload		: `Last will: Host ${appUtil.hostId} is down from ${JSON.stringify(appUtil.ips)}`,
		qos			: 2,
		retain		: true
	},
})

clientMqtt.on('error', function (err) {
	console.error('[MQTT error]');
	console.error(err);
});
clientMqtt.on('connect', function () {
	console.log('MQTT connect');
	clientMqtt.subscribe('ADMIN');
	clientMqtt.subscribe('devices');

	clientMqtt.publish('ADMIN', `Hello  ${appUtil.hostId}: got ips: ${JSON.stringify(appUtil.ips)}`);
	startTshark();
});
clientMqtt.on('message', function (topic, message) {
	// message is Buffer
	console.log(message.toString());
	switch (topic.toString()){
		case 'devices':
			switch (message.toString()) {
				case 'list':
					doList();
					break;
				case 'report':
					doReport();
					break;
				case 'cleanHistory':
					cleanHistory();
					break;
				default:
					let device = {};
					try {
						device = JSON.parse(message.toString());
					} catch (e){
						console.error('[No device JSON provided by MQTT]');
						console.error(e);
						break;
					}
					doDeiviceReport(device.macAddress);
			}
			break;
		case 'ADMIN':
			switch (message.toString()) {
				case 'shutdown':
					shutdown();
					break;
				case 'echo':
					clientMqtt.publish(topic, appUtil.hostId + ' ack');
					break;
				default:
					let config = {};
					try {
						config = JSON.parse(message.toString());
					} catch (e){
						console.error('[No config JSON provided by MQTT]');
						console.error(e);
						break;
					}
					if (config['host'] == appUtil.hostId){
						if (config['lat'] && config['lon']){
							config.hostId = appUtil.hostId;
							config.lat = lat;
							config.lon = lon;
							appUtil.writeConfig(config);
						}
					}
			}
			break;
		default:
	}
});

/* ----------------------------------------------------------------------- */
