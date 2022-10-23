## Description

Display logs that come from a Victron Energy MPPT and sent through a `VE.Direct to USB interface` cable.
UI preview on CodePen: https://codepen.io/kdha200501/pen/QWmmzKx

## Usage

### Installation
```shell
$ npm i -g ve-direct-charger-dashboard
$ mkdir ve-direct-charger-dashboard
$ cd ve-direct-charger-dashboard
$ ve-direct-charger-dashboard
```

### Options

```
  --version                           Show version number              [boolean]
  -d, --directory                     Specify the working directory, defaults to
                                      `process.cwd`                     [string]
  -s, --serial-path                   Specify the path to the USB device,
                                      defaults to "/dev/ttyUSB0"        [string]
  -p, --websocket-server-port-number  Specify port number for the Websocket
                                      server, defaults to 8420          [number]
  -P, --websocket-client-ping-in-ms   Specify the ping interval (in milli
                                      seconds) for Websocket clients, defaults
                                      to 3000                           [number]
  -v, --solar-panel-max-output-mv     Specify the maximum output voltage (in
                                      milli volts) of the solar panel, defaults
                                      to 24000                          [number]
  -a, --battery-range-ma              Specify the range (in milli amps) for the
                                      battery, defaults to 30000 i.e. between
                                      -15A and +15A                     [number]
  -h, --help                          Show help                        [boolean]

```
