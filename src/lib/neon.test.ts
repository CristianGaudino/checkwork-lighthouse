import { expect, it } from 'vitest';
import { parseProjects, primarySize } from './neon';

it('turns active seconds into hours and keeps storage and last activity, skipping odd projects', () => {
    expect(parseProjects({ projects: [
        { id: 'p1', name: 'how-many', active_time: 45_000, compute_last_active_at: '2026-11-13T10:00:00Z', owner_id: 'x' },
        { id: 'p2', name: 'how-much' },
        { id: 3 },
    ] })).toEqual([
        { id: 'p1', name: 'how-many', computeHours: 12.5, storageBytes: null, lastActive: '2026-11-13T10:00:00Z' },
        { id: 'p2', name: 'how-much', computeHours: null, storageBytes: null, lastActive: null },
    ]);
});

it('takes the primary branch\'s size, as the live API returns it', () => {
    // Trimmed from a live response for how-many
    expect(primarySize({ branches: [
        { name: 'dev', primary: false, logical_size: 36_618_240 },
        { name: 'production', primary: true, logical_size: 35_717_120 },
    ] })).toBe(35_717_120);
    expect(primarySize({ branches: [{ default: true, logical_size: 10 }] })).toBe(10);
    expect(primarySize({ branches: [] })).toBeNull();
    expect(primarySize(null)).toBeNull();
});
