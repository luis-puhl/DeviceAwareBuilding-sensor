
const Tshark = require('./src/tshark.js');
const appUtil = require('./src/util.js');
const mqtt = require('mqtt');

const config = appUtil.loadConfig();
let tshark;
let clientMqtt;

/* ----------------------------------------------------------------------- */

function doReport() {
	let report = {
		host		: appUtil.hostId,
		uptime		: process.uptime(),
		sensor		: tshark.getReport(),
	};
	clientMqtt.publish('dab/devices/report', JSON.stringify(report));
}

function doDeiviceReport(macAddress) {
	let report = {
		host		: appUtil.hostId,
		uptime		: process.uptime(),
		sensor		: tshark.getDeviceReport(macAddress),
	};
	clientMqtt.publish('dab/devices/report', JSON.stringify(report));
}

function doList() {
	let report = {
		host		: appUtil.hostId,
		uptime		: process.uptime(),
		sensor		: tshark.getDevices(),
	};
	clientMqtt.publish('dab/devices/report', JSON.stringify(report));
}
function cleanHistory() {
	doList();
	tshark.cleanHistory();
	clientMqtt.publish('dab/devices/report', JSON.stringify({
		host: appUtil.hostId,
		message: "History is now clean",
	}));
}


function shutdown(){
	console.log('Shutdown');
	try {
		clientMqtt.publish('dab/ADMIN', appUtil.hostId + ' is going down.');
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
		clientMqtt.publish('dab/sensors/' + appUtil.hostId, `Got new device with MAC ${JSON.stringify(device)}`);
		console.log(`Got new device with MAC ${JSON.stringify(device)}`);
	} catch (e){
		console.error('[lost MQTT connection]');
		console.error(e);
	}
}

/* ----------------------------------------------------------------------- */

function startTshark() {
	try {
		tshark = Tshark();
		tshark.emitterInstance.on('newDevice', onNewDevice);
	} catch (e) {
		console.error('[Error while strating tshark.js]');
		console.error(e);
		clientMqtt.publish('dab/admin' , e.message);
		if (config.shutdownOnTsharkFail){
			shutdown();
		}
	}
}

/* ----------------------------------------------------------------------- */

function initMqtt(){
	clientMqtt = mqtt.connect(`mqtt://${config.mqttHost}:${config.mqttPort}`, {
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
		clientMqtt.subscribe('dab/admin');
		clientMqtt.subscribe('dab/devices');

		clientMqtt.publish('dab/admin', `Hello  ${appUtil.hostId}: got ips: ${JSON.stringify(appUtil.ips)}`);
		startTshark();
	});
	clientMqtt.on('message', function (topic, message) {
		// message is Buffer
		console.log(message.toString());
		switch (topic.toString()){
			case 'dab/devices':
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
			case 'dab/admin':
				switch (message.toString()) {
					case 'shutdown':
						shutdown();
						break;
					case 'echo':
						clientMqtt.publish('dab/admin', appUtil.hostId + ' ack');
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
						if (config.host === appUtil.hostId){
							if (config.lat !== '' && config.lon !== ''){
								config.hostId = appUtil.hostId;
								appUtil.lat = config.lat;
								appUtil.lon = config.lon;
								appUtil.writeConfig(config);
							}
						}
				}
				break;
			default:
		}
	});
	return true;
}

/* ----------------------------------------------------------------------- */

function init() {
	if (appUtil.autoUpdate()){
		process.on('SIGINT', () => {
			console.log('Received SIGINT.');
			shutdown();
		});
		process.on('SIGTERM', () => {
			console.log('Received SIGTERM.');
			shutdown();
		});
		initMqtt();
	}
}


init();
