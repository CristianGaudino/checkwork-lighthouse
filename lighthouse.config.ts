/**
 * Lighthouse watches every repo OWNER has (src/lib/repos.ts). A line here gives one a nicer name, its live address and
 * its GitHub project number (the number in its URL, github.com/users/<owner>/projects/<n>); without one, a repo goes by
 * its name and the homepage set on GitHub. Uptime is matched by the address, so the UptimeRobot monitor needs no id here.
 */
export const OWNER = 'CristianGaudino';

export type Project = { name: string; repo: string; site?: string; project?: number };

export const PROJECTS: Project[] = [
    { name: 'Checkwork', repo: 'checkwork', site: 'www.checkwork.ie', project: 7 },
    { name: 'Checkwork demo', repo: 'checkwork-demo', site: 'www.demo.checkwork.ie', project: 8 },
    { name: 'Carright', repo: 'cartwright', site: 'www.carright.checkwork.ie', project: 6 },
    { name: 'How Many?', repo: 'vintage', site: 'www.checkhowmany.com', project: 3 },
    { name: 'How Much?', repo: 'how-much', site: 'www.checkhowmuch.com', project: 4 },
    { name: 'Blacktail Archive', repo: 'blacktail', site: 'www.blacktailarchive.cgaudino.com', project: 5 },
    { name: 'Portfolio', repo: 'portfolio', site: 'www.cgaudino.com', project: 2 },
    { name: 'Checkwork Lighthouse', repo: 'checkwork-lighthouse', site: 'www.lighthouse.checkwork.ie', project: 9 },
    { name: 'Anti-social', repo: 'Anti-social', site: 'antisocial.cgaudino.com' },
    { name: 'MotorBid', repo: 'MotorBid', site: 'motor-bid.vercel.app' },
];
