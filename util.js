const os = require('os');

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

/// autoupdate

function autoUpdate(){
	const execSync = require('child_process').execSync;
	let gitPull = execSync('git pull').toString();
	console.log(gitPull);
	if ( gitPull != "Already up-to-date.\n" ){
		console.warn("Just Updated, RESETING");
		process.exit(0);
	}
}

exports.autoUpdate = autoUpdate;
