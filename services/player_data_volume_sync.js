const fs = require('node:fs');
const path = require('node:path');

const sourcePath = path.resolve(__dirname, '..', 'player_data.json');
const candidateDirs = [
  process.env.RAILWAY_VOLUME_MOUNT_PATH,
  process.env.DATA_PATH,
  '/data',
  path.resolve(__dirname, '..', 'data'),
].filter(Boolean);

let syncTimer = null;
let activeDestinationPath = null;

function resolveDestinationDirectory() {
  for (const candidateDir of candidateDirs) {
    try {
      fs.mkdirSync(candidateDir, { recursive: true });
      return candidateDir;
    } catch (error) {
      // Try the next candidate.
    }
  }

  throw new Error(`Unable to create a writable sync directory from: ${candidateDirs.join(', ')}`);
}

function getVolumeDataPath() {
  const destinationDir = resolveDestinationDirectory();
  return path.join(destinationDir, 'player_data.json');
}

function restorePlayerDataFromVolumeIfNeeded() {
  try {
    const volumeDataPath = getVolumeDataPath();

    if (!fs.existsSync(volumeDataPath)) {
      return false;
    }

    const volumeRaw = fs.readFileSync(volumeDataPath, 'utf8');
    if (!volumeRaw.trim()) {
      return false;
    }

    if (fs.existsSync(sourcePath)) {
      const localRaw = fs.readFileSync(sourcePath, 'utf8');
      if (localRaw.trim()) {
        return false;
      }
    }

    fs.writeFileSync(sourcePath, volumeRaw, 'utf8');
    activeDestinationPath = volumeDataPath;
    console.log(`[data-sync] Restored player data from volume to ${sourcePath}`);
    return true;
  } catch (error) {
    console.error(`[data-sync] Failed to restore player data from volume`, error);
    return false;
  }
}

function syncPlayerDataToVolume() {
  try {
    if (!fs.existsSync(sourcePath)) {
      console.warn(`[data-sync] Source file not found at ${sourcePath}`);
      return;
    }

    const raw = fs.readFileSync(sourcePath, 'utf8');
    const data = raw.trim() ? JSON.parse(raw) : {};
    const destinationDir = resolveDestinationDirectory();
    const destinationPath = path.join(destinationDir, 'player_data.json');
    const payload = `${JSON.stringify(data, null, 2)}\n`;

    if (fs.existsSync(destinationPath)) {
      const existing = fs.readFileSync(destinationPath, 'utf8');
      if (existing === payload) {
        activeDestinationPath = destinationPath;
        return;
      }
    }

    fs.writeFileSync(destinationPath, payload, 'utf8');
    activeDestinationPath = destinationPath;
    console.log(`[data-sync] Synced player data to ${destinationPath}`);
  } catch (error) {
    console.error(`[data-sync] Failed to sync player data to volume`, error);
  }
}

function scheduleSync() {
  if (syncTimer) {
    clearTimeout(syncTimer);
  }

  syncTimer = setTimeout(() => {
    syncPlayerDataToVolume();
  }, 250);
}

function startPlayerDataVolumeSync() {
  try {
    if (!fs.existsSync(sourcePath)) {
      console.warn(`[data-sync] No local player_data.json found yet; checking mounted volume for persisted data`);
    }

    restorePlayerDataFromVolumeIfNeeded();
    syncPlayerDataToVolume();

    fs.watchFile(sourcePath, { interval: 500 }, () => {
      scheduleSync();
    });

    console.log(`[data-sync] Watching ${sourcePath} for changes`);
  } catch (error) {
    console.error(`[data-sync] Could not start watcher`, error);
  }
}

module.exports = {
  startPlayerDataVolumeSync,
  syncPlayerDataToVolume,
  get destinationPath() {
    return activeDestinationPath;
  },
};
