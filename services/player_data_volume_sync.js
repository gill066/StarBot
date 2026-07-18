const fs = require('node:fs');
const path = require('node:path');

// Target source file paths
const playerSourcePath = path.resolve(__dirname, '..', 'player_data.json');
const showrunnerSourcePath = path.resolve(__dirname, '..', 'showrunner_data.json');

const candidateDirs = [
  process.env.RAILWAY_VOLUME_MOUNT_PATH,
  process.env.DATA_PATH,
  '/data',
  path.resolve(__dirname, '..', 'data'),
].filter(Boolean);

// Independent write debouncers to prevent concurrency conflicts
let playerSyncTimer = null;
let showrunnerSyncTimer = null;

// Track storage directory pathways
let activePlayerDestPath = null;
let activeShowrunnerDestPath = null;

function resolveDestinationDirectory() {
  for (const candidateDir of candidateDirs) {
    try {
      fs.mkdirSync(candidateDir, { recursive: true });
      return candidateDir;
    } catch (error) {
      // Try the next candidate path down the line
    }
  }

  throw new Error(`Unable to create a writable sync directory from: ${candidateDirs.join(', ')}`);
}

// ============================================================================
// INTERNAL REFACTOR GENERICS (Keeps the code DRY)
// ============================================================================

function restoreFileFromVolume(sourcePath, fileName) {
  try {
    const destinationDir = resolveDestinationDirectory();
    const volumeDataPath = path.join(destinationDir, fileName);

    if (!fs.existsSync(volumeDataPath)) {
      return null;
    }

    const volumeRaw = fs.readFileSync(volumeDataPath, 'utf8');
    if (!volumeRaw.trim()) {
      return null;
    }

    if (fs.existsSync(sourcePath)) {
      const localRaw = fs.readFileSync(sourcePath, 'utf8');
      if (localRaw.trim()) {
        return null; // Local copy is alive and non-empty; do not overwrite
      }
    }

    fs.writeFileSync(sourcePath, volumeRaw, 'utf8');
    console.log(`[data-sync] Restored ${fileName} from volume mount path over to ${sourcePath}`);
    return volumeDataPath;
  } catch (error) {
    console.error(`[data-sync] Failed to restore ${fileName} from volume tracking`, error);
    return null;
  }
}

function syncFileToVolume(sourcePath, fileName) {
  try {
    if (!fs.existsSync(sourcePath)) {
      console.warn(`[data-sync] Source file not found at ${sourcePath}`);
      return null;
    }

    const raw = fs.readFileSync(sourcePath, 'utf8');
    const data = raw.trim() ? JSON.parse(raw) : {};
    const destinationDir = resolveDestinationDirectory();
    const destinationPath = path.join(destinationDir, fileName);
    const payload = `${JSON.stringify(data, null, 2)}\n`;

    if (fs.existsSync(destinationPath)) {
      const existing = fs.readFileSync(destinationPath, 'utf8');
      if (existing === payload) {
        return destinationPath; // Data matches exactly, bypass writing sequence
      }
    }

    fs.writeFileSync(destinationPath, payload, 'utf8');
    console.log(`[data-sync] Synced ${fileName} structural updates to ${destinationPath}`);
    return destinationPath;
  } catch (error) {
    console.error(`[data-sync] Failed to sync ${fileName} to volume array mapping`, error);
    return null;
  }
}

// ============================================================================
// PLAYER DATA LIFECYCLE
// ============================================================================

function startPlayerDataVolumeSync() {
  try {
    if (!fs.existsSync(playerSourcePath)) {
      console.warn(`[data-sync] No local player_data.json found yet; checking mounted volume for persisted data`);
    }

    const restored = restoreFileFromVolume(playerSourcePath, 'player_data.json');
    if (restored) activePlayerDestPath = restored;

    const synced = syncFileToVolume(playerSourcePath, 'player_data.json');
    if (synced) activePlayerDestPath = synced;

    fs.watchFile(playerSourcePath, { interval: 500 }, () => {
      if (playerSyncTimer) clearTimeout(playerSyncTimer);
      playerSyncTimer = setTimeout(() => {
        const p = syncFileToVolume(playerSourcePath, 'player_data.json');
        if (p) activePlayerDestPath = p;
      }, 250);
    });

    console.log(`[data-sync] Watching ${playerSourcePath} for changes`);
  } catch (error) {
    console.error(`[data-sync] Could not start player data watcher module`, error);
  }
}

function syncPlayerDataToVolume() {
  const p = syncFileToVolume(playerSourcePath, 'player_data.json');
  if (p) activePlayerDestPath = p;
}

// ============================================================================
// SHOWRUNNER DATA LIFECYCLE
// ============================================================================

function startShowrunnerDataVolumeSync() {
  try {
    if (!fs.existsSync(showrunnerSourcePath)) {
      console.warn(`[data-sync] No local showrunner_data.json found yet; checking mounted volume for persisted data`);
    }

    const restored = restoreFileFromVolume(showrunnerSourcePath, 'showrunner_data.json');
    if (restored) activeShowrunnerDestPath = restored;

    const synced = syncFileToVolume(showrunnerSourcePath, 'showrunner_data.json');
    if (synced) activeShowrunnerDestPath = synced;

    fs.watchFile(showrunnerSourcePath, { interval: 500 }, () => {
      if (showrunnerSyncTimer) clearTimeout(showrunnerSyncTimer);
      showrunnerSyncTimer = setTimeout(() => {
        const s = syncFileToVolume(showrunnerSourcePath, 'showrunner_data.json');
        if (s) activeShowrunnerDestPath = s;
      }, 250);
    });

    console.log(`[data-sync] Watching ${showrunnerSourcePath} for changes`);
  } catch (error) {
    console.error(`[data-sync] Could not start showrunner data watcher module`, error);
  }
}

function syncShowrunnerDataToVolume() {
  const s = syncFileToVolume(showrunnerSourcePath, 'showrunner_data.json');
  if (s) activeShowrunnerDestPath = s;
}

module.exports = {
  startPlayerDataVolumeSync,
  syncPlayerDataToVolume,
  startShowrunnerDataVolumeSync,
  syncShowrunnerDataToVolume,
  get destinationPath() {
    return activePlayerDestPath;
  },
  get showrunnerDestinationPath() {
    return activeShowrunnerDestPath;
  },
};