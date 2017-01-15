# DeviceAwareBuilding-sensor
An tshark runner publishing on a MQTT broker.
$ git clone https://github.com/luis-puhl/DeviceAwareBuilding-sensor.git
$ cd DeviceAwareBuilding-sensor/
$ npm install
$ sudo npm install -g forever forever-service
$ sudo apt-get install tshark 
$ sudo usermod -a -G wireshark pi
$ sudo shutdown -r now
$ sudo forever-service install device-sensor -r pi --start
