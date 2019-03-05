import * as moment from 'moment';
import * as express from 'express';
import * as ical from 'ical-generator';
import { createHash } from 'crypto';

import * as TIMETABLES from '../../assets/timetables.json';
import { RichLecture } from '../../model/RichLecture';
import { SplusApi } from '../lib/SplusApi';
import { eventNames } from 'cluster';

const router = express.Router();

const sha256 = (x) => createHash('sha256').update(x, 'utf8').digest('hex');
const flatten = <T>(arr: T[][]) => [].concat(...arr) as T[];
const range = (lower: number, upper: number) => Array.from(Array(upper), (x, i) => lower + i);

interface Timetable {
  id: string;
  setplan: boolean;
}

function lecturesForTimetableAndWeek(timetable: Timetable, week: number) {
  return SplusApi.getData('#' + timetable.id, week, timetable.setplan)
    .then((lectures) => lectures.map((lecture) => new RichLecture(lecture, week)));
}

function lecturesForTimetablesAndWeek(timetables: Timetable[], week: number) {
  return Promise.all(timetables.map((timetable) => lecturesForTimetableAndWeek(timetable, week)))
    .then(flatten);
}

function lecturesForTimetablesAndWeeks(timetables: Timetable[], weeks: number[]) {
  return Promise.all(weeks.map((week) => lecturesForTimetablesAndWeek(timetables, week)))
    .then(flatten);
}

function lectureToEvent(lecture: RichLecture) {
  const uid = sha256(JSON.stringify(lecture)).substr(0, 16);
  return {
    uid,
    start: moment(lecture.start).add(lecture.begin, 'hours').toDate(),
    end: moment(lecture.start).add(lecture.begin + lecture.duration, 'hours').toDate(),
    timestamp: moment().toDate(),
    summary: lecture.title,
    description: lecture.lecturer + (lecture.info != '' ? ' - ' : '') + lecture.info,
    location: lecture.room,
    timezone: 'Europe/Berlin',
  };
}

router.get('/:timetables/:lectures', async (req, res, next) => {
  const timetableIds = <string[]>req.params.timetables.split(',');
  const titleIds = <string[]>req.params.lectures.split(',');

  const timetables = timetableIds
    .map((timetableId) => (<Timetable[]>TIMETABLES).find(({ id }) => id == timetableId))
    .filter((timetable) => timetable != undefined);

  const thisWeek = moment().week();
  const weeks = range(thisWeek, thisWeek + 4);

  const allLectures = await lecturesForTimetablesAndWeeks(timetables, weeks);
  const lectures = allLectures.filter(({ titleId }) => titleIds.includes(titleId));
  const events = lectures.map(lectureToEvent);

  const cal = ical({ domain: 'spluseins.de', events, timezone: 'Europe/Berlin' });
  res.set('Content-Type', 'text/plain');
  res.send(cal.toString());
});

export default router;
