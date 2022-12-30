#!/usr/bin/env node

'use strict';
const { SerialPort } = require('serialport');
const { Observable, timer, ReplaySubject } = require('rxjs');
const {
  scan,
  filter,
  exhaustMap,
  takeUntil,
  shareReplay,
  take,
  skip,
  switchMap,
} = require('rxjs/operators');
const { createServer } = require('http');
const { WebSocketServer } = require('ws');
const { mkdirSync, existsSync, writeFileSync, readFileSync } = require('fs');
const { join } = require('path');
const {
  rollOffHourlySnapshots,
  getNextHourlySnapshotMomentInMs,
  updateHourlySnapshot,
  updateDailySnapshot,
} = require('./utils');

/**
 * @typedef {{d: string, t: string, s: string, p: number, P: number, v: number, a: number}} CliInputArgs
 */

/**
 * @typedef {{cwd: string, serialPath: string, wsPortNumber: number, wsPingIntervalInMs: number, voltageMaxInMv: number, currentRangeInMA: number}} CliAppConfig
 */

/**
 * @type {CliInputArgs}
 */
const argv = require('yargs')
  .usage('Usage: $0 [options]')

  // directory option
  .alias('d', 'directory')
  .nargs('d', 1)
  .string('d')
  .describe('d', 'Specify the working directory, defaults to `process.cwd`')

  // serial path option
  .alias('s', 'serial-path')
  .nargs('s', 1)
  .string('s')
  .describe(
    's',
    'Specify the path to the USB device, defaults to "/dev/ttyUSB0"'
  )

  // webSocket server port number option
  .alias('p', 'websocket-server-port-number')
  .nargs('p', 1)
  .number('p')
  .describe(
    'p',
    'Specify port number for the Websocket server, defaults to 8420'
  )

  // webSocket client ping interval option
  .alias('P', 'websocket-client-ping-in-ms')
  .nargs('P', 1)
  .number('P')
  .describe(
    'P',
    'Specify the ping interval (in milli seconds) for Websocket clients, defaults to 3000'
  )

  // solar panel maximum output voltage option
  .alias('v', 'solar-panel-max-output-mv')
  .nargs('v', 1)
  .number('v')
  .describe(
    'v',
    'Specify the maximum output voltage (in milli volts) of the solar panel, defaults to 24000'
  )

  // battery current range option
  .alias('a', 'battery-range-ma')
  .nargs('a', 1)
  .number('a')
  .describe(
    'a',
    'Specify the range (in milli amps) for the battery, defaults to 30000 i.e. between -15A and +15A'
  )

  // help option
  .help('h')
  .alias('h', 'help').argv;

/**
 * initialize CLI input arguments
 * @param {CliInputArgs} argv
 * @return {CliAppConfig}
 */
function getCliAppConfig({ d, s, p, P, v, a }) {
  const {
    defaultSerialPath,
    defaultWsPortNumber,
    defaultWsPingIntervalInMs,
    defaultVoltageMaxInMv,
    defaultCurrentRangeInMA,
  } =
    // eslint-disable-next-line global-require
    require('./const');

  return {
    cwd: d || process.cwd(),
    serialPath: s ?? defaultSerialPath,
    wsPortNumber: isNaN(p) ? defaultWsPortNumber : p,
    wsPingIntervalInMs: isNaN(P) ? defaultWsPingIntervalInMs : P,
    voltageMaxInMv: isNaN(v) ? defaultVoltageMaxInMv : v,
    currentRangeInMA: isNaN(a) ? defaultCurrentRangeInMA : a,
  };
}

/**
 * initialize the current working directory
 * - create snapshot folder, if not already exist
 * - generate config.json for the web-ui
 *
 * @param {CliAppConfig} cliAppConfig
 *
 * @return {Error|*} Error, if any
 */
function initDir({ cwd, voltageMaxInMv, currentRangeInMA }) {
  const { snapshotsDirName, snapshotHourlyFileName, uiConfigFileName } =
    // eslint-disable-next-line global-require
    require('./const');

  // create the "snapshots" folder
  let writePath = join(cwd, snapshotsDirName);
  if (!existsSync(writePath)) {
    try {
      mkdirSync(writePath, { recursive: true });
    } catch (err) {
      return err;
    }
  }

  // roll off expired hourly snapshots
  writePath = join(cwd, snapshotsDirName, snapshotHourlyFileName);
  if (existsSync(writePath)) {
    let fileContent = existsSync(writePath)
      ? JSON.parse(readFileSync(writePath, 'utf8'))
      : [];

    fileContent = rollOffHourlySnapshots(fileContent);

    try {
      writeFileSync(writePath, JSON.stringify(fileContent, null, 2));
    } catch (err) {
      return err;
    }
  }

  // create the "config.json" file
  const config = {
    voltageMaxInMv,
    currentRangeInMA,
  };
  try {
    writeFileSync(join(cwd, uiConfigFileName), JSON.stringify(config, null, 2));
  } catch (err) {
    return err;
  }
}

/* ====== */
/*  main  */
/* ====== */
const cliAppConfig = getCliAppConfig(argv);

const initError = initDir(cliAppConfig);
if (initError) {
  throw initError;
}

/**
 * @desc Initialize the connection with the serial port
 */
const { serialPath, wsPortNumber, wsPingIntervalInMs } = cliAppConfig;
const logChunk$ = new Observable((subscriber) => {
  // on subscribe
  const { defaultBaudRate } =
    // eslint-disable-next-line global-require
    require('./const');
  const serialPort = new SerialPort({
    path: serialPath,
    baudRate: defaultBaudRate,
  });

  serialPort.on('data', (chunkBuffer) => subscriber.next(chunkBuffer));

  // on unsubscribe
  return () => serialPort.close();
}).pipe(shareReplay(1));

/**
 * @desc Initialize the WebSocket server
 */
const server = createServer(({ url }, response) => {
  const urlLowerCase = url?.toLowerCase() ?? '';

  if (urlLowerCase === '/') {
    response.writeHeader(200, { 'Content-Type': 'text/html' });
    response.write(readFileSync(join(__dirname, 'index.html'), 'utf8'));
    response.end();
    return;
  }

  if (urlLowerCase === '/config.json') {
    response.writeHeader(200, { 'Content-Type': 'application/json' });
    const { uiConfigFileName } =
      // eslint-disable-next-line global-require
      require('./const');
    response.write(
      readFileSync(join(cliAppConfig.cwd, uiConfigFileName), 'utf8')
    );
    response.end();
    return;
  }

  if (urlLowerCase.endsWith('.js')) {
    response.writeHeader(200, { 'Content-Type': 'text/javascript' });
    response.write(
      readFileSync(join(__dirname, ...urlLowerCase.split('/')), 'utf8')
    );
    response.end();
    return;
  }

  response.writeHead(404, { 'Content-Type': 'text/plain' });
  response.write('404 Not Found\n');
  response.end();
});
const webSocketServer = new WebSocketServer({
  server,
  path: '/ws',
});
server.listen(wsPortNumber);

webSocketServer.on('connection', (client) => {
  const isConnectionClosed$ = new ReplaySubject(1);
  const closeConnection = () => {
    // console.log("close connection with client");
    isConnectionClosed$.next();
    isConnectionClosed$.complete();
    client.terminate();
  };

  // subscription to a client
  timer(wsPingIntervalInMs, wsPingIntervalInMs)
    .pipe(
      // ignore the next scheduled ping if the current ping has not resolved
      exhaustMap(
        () =>
          new Promise((resolve) => {
            client.ping(undefined, undefined, (error) => resolve(!error));
          })
      ),
      takeUntil(isConnectionClosed$)
    )
    .subscribe(
      // onNext
      (isConnectionLive) => !isConnectionLive && closeConnection(),
      // onError
      closeConnection
    );
});

/**
 * @desc Broadcast data from serial port to WebSocket
 */
const log$ = logChunk$.pipe(
  scan(
    ([logBuffer, isLogComplete], chunkBuffer) => {
      /*
       * if this is the first chunk being read from the serial port since it opened, or
       * if the previous chunk is the end of log
       */
      if (isLogComplete) {
        // then reset the accumulation i.e. let a new log begin
        return [Buffer.from(chunkBuffer), false];
      }

      /*
       * note 1: the checksum field can be split into multiple chunks
       * note 2: the chunk(s) containing the checksum field would never be mixed with fields from the next chunk
       */
      const buffer = Buffer.concat([logBuffer, chunkBuffer]);
      return [buffer, buffer.includes('Checksum', 'ASCII')];
    },
    [undefined, true]
  ),
  filter(([logBuffer, isLogComplete]) => {
    // if the log is incomplete
    if (!isLogComplete) {
      // then invalidate the log
      return false;
    }

    // if all the bytes in the log do not add up to multiples of 256 i.e. checksum mismatch
    if (logBuffer.reduce((acc, cur) => acc + cur, 0) % 256 !== 0) {
      // then invalidate the log
      return false;
    }

    return true;
  }),
  shareReplay(1)
);

// subscription to the serial port
const logSubscription = log$.subscribe(([logBuffer]) =>
  webSocketServer.clients.forEach((client) => {
    // console.log("send data to client");
    client.send(logBuffer, { binary: true });
  })
);

/**
 * @desc Save snapshots of the serial port data
 */
const logSample$ = log$.pipe(take(2), skip(1));
const logSampleSubscription = timer(
  getNextHourlySnapshotMomentInMs(),
  60 * 60 * 1000
)
  .pipe(switchMap(() => logSample$))
  .subscribe((log) => {
    updateHourlySnapshot(cliAppConfig.cwd, log);
    updateDailySnapshot(cliAppConfig.cwd, log);
  });

/**
 * @desc Started up
 */
console.log(
  `** Server is listening on 0.0.0.0:${wsPortNumber}, open your browser on http://localhost:${wsPortNumber}/ **`
);

/**
 * @desc Clean up
 */
// on `exit` event
process.on('exit', (code) => {
  logSubscription.unsubscribe();
  logSampleSubscription?.unsubscribe();
  // pingSubscription.unsubscribe();
  webSocketServer.close();
  webSocketServer.clients.forEach((client) => client.terminate());
});

// on <ctrl> + c
process.on('SIGINT', () =>
  // delegate to the `exit` event
  process.exit()
);
