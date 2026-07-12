import { copyFile } from 'fs/promises';

async function duplicateJson() {
  try {
    await copyFile('player_data.json', '/data/data.json');
    console.log('JSON file duplicated successfully!');
  } catch (error) {
    console.error('Error duplicating file:', error);
  }
}

duplicateJson();