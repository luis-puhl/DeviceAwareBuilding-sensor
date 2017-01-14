#!/bin/bash
sudo tshark -I -i wlan1 -T fields -E separator=, -E quote=d -e wlan.sa -e radiotap.dbm_antsignal -e wlan_mgt.ssid -Y 'wlan.sa' -c 1000
