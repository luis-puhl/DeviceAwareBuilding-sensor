const os = require('os');
const fs = require('fs');
const childProcess = require('child_process')

let config = require('./.config');

const hostId = os.userInfo().username + '@' + os.hostname();
exports.hostId = hostId;

/* ----------------------------------------------------------------------- */

let ips = [];
let ifaces = os.networkInterfaces();

for (let ifname in ifaces){
	let alias = 0;
	for (let iface of ifaces[ifname]){
		// skip loopbacks
		if (iface.internal !== true){
			// save IP for later
			ips.push(iface.address);

			if (alias >= 1) {
				// this single interface has multiple ipv4 addresses
				console.log(ifname + ':' + alias, iface.address);
			} else {
				// this interface has only one ipv4 adress
				console.log(ifname, iface.address);
			}
			++alias;
		}
	}
}

exports.ips = ips;

/* ----------------------------------------------------------------------- */

function loadConfig() {
	// remove localization info if wrong host
	if (config.hostId != hostId){
		config.hostId = hostId;
		delete config.lat;
		delete config.lon;
	}
	return config;
}

exports.loadConfig = loadConfig;

function writeConfig(config){
	fs.writeFile(".config", JSON.stringify(config), (err) => {
		if (err) {
			return console.log(err);
		}
		console.log("The file was saved!");
		return true;
	});
}

exports.writeConfig = writeConfig;

/* ----------------------------------------------------------------------- */

// autoupdate

function autoUpdate(){
	const execSync = childProcess.execSync;
	let gitPull = execSync('git pull').toString();
	console.log(gitPull);
	if ( gitPull != "Already up-to-date.\n" ){
		console.warn("Just Updated, RESETING");
		return true;
	}
	return false;
}

exports.autoUpdate = autoUpdate;
