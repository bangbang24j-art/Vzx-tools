const fs = require('fs'), path = require('path');
const { initAuthCreds, BufferJSON } = require('@whiskeysockets/baileys');
function useJSONAuthState(folderPath) {
  if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath, { recursive: true });
  const write = (file, data) => {
    fs.writeFileSync(path.join(folderPath, `${file}.tmp`), JSON.stringify(data, BufferJSON.replacer, 2));
    fs.renameSync(path.join(folderPath, `${file}.tmp`), path.join(folderPath, `${file}.json`));
  };
  const read = (file) => {
    const t = path.join(folderPath, `${file}.json`);
    return fs.existsSync(t) ? JSON.parse(fs.readFileSync(t, 'utf-8'), BufferJSON.reviver) : null;
  };
  let creds = read('creds');
  if (!creds) { creds = initAuthCreds(); write('creds', creds); }
  return {
    state: { creds, keys: {
      get: (type, ids) => ids.reduce((acc, id) => { const v = read(`${type}-${id}`); if (v) acc[id] = v; return acc }, {}),
      set: (data) => { for (const type in data) for (const id in data[type]) { const v = data[type][id]; v ? write(`${type}-${id}`, v) : fs.unlinkSync(path.join(folderPath, `${type}-${id}.json`)) } }
    }}, saveCreds: () => write('creds', creds)
  };
}
module.exports = { useJSONAuthState };
