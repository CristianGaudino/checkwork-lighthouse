import { expect, it } from 'vitest';
import { parseProjects } from './neon';

it('turns active seconds into hours and keeps storage and last activity, skipping odd projects', () => {
    expect(parseProjects({ projects: [
        { id: 'p1', name: 'how-many', active_time: 45_000, synthetic_storage_size: 31_457_280, compute_last_active_at: '2026-11-13T10:00:00Z', owner_id: 'x' },
        { id: 'p2', name: 'how-much' },
        { id: 3 },
    ] })).toEqual([
        { id: 'p1', name: 'how-many', computeHours: 12.5, storageBytes: 31_457_280, lastActive: '2026-11-13T10:00:00Z' },
        { id: 'p2', name: 'how-much', computeHours: null, storageBytes: null, lastActive: null },
    ]);
});
