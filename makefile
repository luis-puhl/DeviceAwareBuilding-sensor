remote:
	(ssh pi@ltia-rpi-01 "cd /home/pi/tshark/ ; nc -q 100 -l -p 8080 | tar xz") &
	tar zc . | nc -w 100 ltia-rpi-01 8080

remote-test:
	ssh pi@ltia-rpi-01 "cd /home/pi/tshark/ ; make test &"

test:
	./tshark.sh | node parse.js
