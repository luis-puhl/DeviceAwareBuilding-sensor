#!/bin/bash
sudo tshark -I -i wlan0 -T fields -E separator=, -E quote=d -e wlan.sa -e radiotap.dbm_antsignal -e wlan_mgt.ssid -Y 'wlan.sa' -c 1000
# sudo usermod -a -G systemd-network pi
# sudo usermod -a -G wireshark pi
sudo forever-service install device-sensor -r pi --start
sudo service device-sensor restart 
