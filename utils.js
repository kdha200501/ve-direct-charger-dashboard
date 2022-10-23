const moment = require('moment-timezone');
const { join } = require('path');
const { existsSync, readFileSync, writeFileSync } = require('fs');

const { snapshotsDirName, snapshotHourlyFileName } = require('./const');

/**
 * @type {(cwd: string, log: Buffer) => void}
 */
const updateDailySnapshot = (cwd, log) => {
  const snapshotMoment = moment().subtract(1, 'day');

  const filePath = join(
    cwd,
    snapshotsDirName,
    `${snapshotMoment.format('YYYY')}.json`
  );

  try {
    const fileContent = existsSync(filePath)
      ? JSON.parse(readFileSync(filePath, 'utf8'))
      : [];

    const dayEnergyMap = new Map(fileContent);
    const day = snapshotMoment.format('DDD');

    if (dayEnergyMap.get(day)) {
      return;
    }

    // note: H22 is the Yesterday Energy Yield
    const [yesterdayEnergyYield] =
      log.toString().match(/(?<=\r\nH22\t)(.*)(?=\r\n)/) ?? [];

    if (!yesterdayEnergyYield || /[^0-9]+/.test(yesterdayEnergyYield)) {
      return;
    }

    dayEnergyMap.set(day, Number(yesterdayEnergyYield));

    writeFileSync(filePath, JSON.stringify([...dayEnergyMap], null, 2));
  } catch (err) {
    // eslint-disable-next-line no-empty
  }
};

/**
 * @type {() => number}
 */
const getNextHourlySnapshotMomentInMs = () => {
  const nowMoment = moment();
  const nextHourlySnapshotMoment = nowMoment
    .clone()
    .startOf('hour')
    .add(1, 'hour');
  return Math.max(0, nextHourlySnapshotMoment.diff(nowMoment));
};

/**
 * @typedef {[string, string]} HourlySnapShotTimeLogPair
 */
/**
 * @type {(hourlySnapShotTimeLogPair: HourlySnapShotTimeLogPair[]) => HourlySnapShotTimeLogPair[]}
 */
const rollOffHourlySnapshots = (hourlySnapShotTimeLogPairs) => {
  const rollOffMoment = moment().startOf('hour').subtract(24, 'hour');

  return hourlySnapShotTimeLogPairs.filter(([dateHour]) =>
    moment(dateHour, 'YYYY-MM-DD HH').isAfter(rollOffMoment)
  );
};

/**
 * @type {(cwd: string, log: Buffer) => void}
 */
const updateHourlySnapshot = (cwd, log) => {
  const snapshotMoment = moment();

  const filePath = join(cwd, snapshotsDirName, snapshotHourlyFileName);

  try {
    let fileContent = existsSync(filePath)
      ? JSON.parse(readFileSync(filePath, 'utf8'))
      : [];

    // note: H19 is the Total Energy Yield
    const [totalEnergyYield] =
      log.toString().match(/(?<=\r\nH19\t)(.*)(?=\r\n)/) ?? [];

    if (!totalEnergyYield || /[^0-9]+/.test(totalEnergyYield)) {
      return;
    }

    fileContent = [
      ...rollOffHourlySnapshots(fileContent),
      [`${snapshotMoment.format('YYYY-MM-DD HH')}`, Number(totalEnergyYield)],
    ];

    writeFileSync(filePath, JSON.stringify(fileContent, null, 2));
  } catch (err) {
    // eslint-disable-next-line no-empty
  }
};

module.exports = {
  rollOffHourlySnapshots,
  getNextHourlySnapshotMomentInMs,
  updateHourlySnapshot,
  updateDailySnapshot,
};
