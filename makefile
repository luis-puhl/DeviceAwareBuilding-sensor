remote:
	(ssh pi@ltia-rpi-01 "cd /home/pi/DeviceAwareBuilding-sensor/ ; nc -q 100 -l -p 8080 | tar xz") &
	tar zc . | nc -w 100 ltia-rpi-01 8080
	ssh pi@ltia-rpi-01 "sudo service device-sensor restart"

remote-test:
	ssh pi@ltia-rpi-01 "cd /home/pi/DeviceAwareBuilding-sensor/ ; make test &"

test:
	./tshark.sh | node parse.js
