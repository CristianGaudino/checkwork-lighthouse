import { expect, it } from 'vitest';
import { domainOf, domainTasks, expiryOf } from './domains';

const NOW = Date.parse('2026-11-14T12:00:00Z');
const p = (name: string, site: string) => ({ name, repo: name, site, project: 1 });

it('finds the registered domain under a site', () => {
    expect([domainOf('www.demo.checkwork.ie'), domainOf('www.blacktailarchive.cgaudino.com'), domainOf('checkhowmany.com')]).toEqual(['checkwork.ie', 'cgaudino.com', 'checkhowmany.com']);
});

it('reads the expiry event from an RDAP answer', () => {
    expect(expiryOf({ events: [{ eventAction: 'registration', eventDate: '2026-10-22T17:50:33Z' }, { eventAction: 'expiration', eventDate: '2027-10-22T17:50:33Z' }] })).toBe('2027-10-22T17:50:33Z');
    expect([expiryOf({ errorCode: 404 }), expiryOf(null)]).toEqual([null, null]);
});

it('asks to renew within 30 days, red within 7, once per domain', () => {
    const projects = [p('a', 'www.a.com'), p('a-demo', 'www.demo.a.com'), p('b', 'www.b.com'), p('c', 'www.c.com'), p('d', 'www.d.ie')];
    const expiry = new Map([['a.com', '2026-12-01T00:00:00Z'], ['b.com', '2026-11-18T00:00:00Z'], ['c.com', '2027-06-01T00:00:00Z']]);
    expect(domainTasks(projects, expiry, NOW).map(t => [t.project, t.title, t.level, t.detail])).toEqual([
        ['a', 'a.com', 2, 'Expires in 17 days. Renew it at the registrar'],
        ['b', 'b.com', 1, 'Expires in 4 days. Renew it at the registrar'],
    ]);
    expect(domainTasks([p('a', 'a.com')], new Map([['a.com', '2026-11-10T00:00:00Z']]), NOW)[0]).toMatchObject({ action: 'Domain expired:', level: 1 });
});
