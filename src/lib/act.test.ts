import { expect, it } from 'vitest';
import { checkIssue, checkNumber, checkRepo } from './act';

it('only lets a configured repo and a positive whole PR number through', () => {
    expect(checkRepo('vintage')).toBe('vintage');
    expect([checkRepo('someone-else'), checkRepo('../vintage'), checkRepo(null)]).toEqual([null, null, null]);
    expect(checkNumber('12')).toBe(12);
    expect([checkNumber('0'), checkNumber('-3'), checkNumber('1.5'), checkNumber('12; drop'), checkNumber(null)]).toEqual([null, null, null, null, null]);
});

it('trims an issue, defaults an unknown type to Task, and refuses an empty or oversized one', () => {
    expect(checkIssue({ title: '  Fix the header  ', body: ' Steps ', type: 'Bug' })).toEqual({ title: 'Fix the header', body: 'Steps', type: 'Bug' });
    expect(checkIssue({ title: 'X', body: null, type: 'Epic' })).toEqual({ title: 'X', body: '', type: 'Task' });
    expect(checkIssue({ title: '   ', body: '', type: 'Bug' })).toBeNull();
    expect(checkIssue({ title: 'x'.repeat(257), body: '', type: 'Bug' })).toBeNull();
});
