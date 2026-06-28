export interface ChangelogEntry {
  version: string
  date: string
  changes: string[]
}

export const changelog: ChangelogEntry[] = [
  {
    version: '0.1.0',
    date: '2026-06-27',
    changes: [
      'changelog.new_0_1_0_1',
    ],
  },
]
