import { Directory } from 'expo-file-system';

// wipeLocalData deletes the wallet's on-disk data directory. The caller MUST
// stop the runtime first so the daemon's SQLite handles are closed; the
// daemon recreates the directory on the next start. The web demo wipes OPFS
// across a reload; on native there is no reload, so this runs live. An empty
// dataDir is a caller bug (nothing would be deleted), so it throws rather than
// silently succeeding: a wipe that quietly removes nothing must never look
// like a wipe that worked.
export async function wipeLocalData(dataDir: string): Promise<void> {
  if (!dataDir) {
    throw new Error('wipeLocalData called with an empty data directory.');
  }

  const uri = dataDir.startsWith('file://') ? dataDir : `file://${dataDir}`;
  const dir = new Directory(uri);
  if (dir.exists) {
    dir.delete();
  }
}
