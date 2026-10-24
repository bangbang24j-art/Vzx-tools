const { default: makeWASocket, DisconnectReason, fetchLatestWaWebVersion, Browsers } = require('@whiskeysockets/baileys')
const { useJSONAuthState } = require('./session')
const { Boom } = require('@hapi/boom')
const P = require('pino')
const fs = require('fs')
const path = require('path')
const readline = require('readline')
const figlet = require('figlet')

const C = {
  reset: "\x1b[0m", bright: "\x1b[1m", dim: "\x1b[2m",
  red: "\x1b[31m", green: "\x1b[32m", yellow: "\x1b[33m", blue: "\x1b[34m", magenta: "\x1b[35m", cyan: "\x1b[36m", white: "\x1b[37m",
  bgGreen: "\x1b[42m", bgBlack: "\x1b[40m", bgYellow: "\x1b[43m"
}
const PROMPT = `${C.magenta}~msg> ${C.reset}`

const DEVICES = [
  { id: 1, name: "Google Chrome (Ubuntu)", browser: Browsers.ubuntu('Chrome') },
  { id: 2, name: "Google Chrome (Windows)", browser: Browsers.windows('Chrome') },
  { id: 3, name: "Google Chrome (macOS) [RECOMMENDED]", browser: Browsers.macOS('Chrome') },
  { id: 4, name: "WhatsApp Android", browser: Browsers.android('Chrome') },
  { id: 5, name: "Baileys Default (Safe)", browser: Browsers.ubuntu('Chrome') }
]

const CONFIG_FILE = path.join(__dirname, 'vzx_config.json')
let CONFIG = { editText: "Masukan teks...", delay: 1000, isRunning: false, deviceId: 3 }
let prevConfig = { ...CONFIG }
let uiMode = 'main' 
let tempPhone = null;
let tempWaType = null;

if (fs.existsSync(CONFIG_FILE)) {
  try {
    const saved = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'))
    CONFIG = { ...CONFIG, ...saved }
    prevConfig = { ...CONFIG }
  } catch (e) {}
}

let bots = [] 
let logs = []
let totalEdits = 0

const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: PROMPT })

function saveConfigToFile() {
  const saveData = { editText: CONFIG.editText, delay: CONFIG.delay, deviceId: CONFIG.deviceId }
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(saveData, null, 2))
  prevConfig = { ...CONFIG }
}

function redraw() {
  process.stdout.write('\x1b[3J\x1b[2J\x1b[H'); 

  if (uiMode === 'note') {
    console.log(C.bgYellow + C.black + C.bright + " [ NOTE / FITUR BOT ] " + C.reset + "\n")
    console.log(`${C.green} [+] Edit Pesan   ${C.dim}: Otomatis ubah teks pesan yang lu kirim.`)
    console.log(`${C.green} [+] Auto Reject  ${C.dim}: Menolak panggilan (Voice/Video) masuk otomatis.`)
    console.log(`${C.green} [+] Fast Delay   ${C.dim}: Ngatur jeda waktu edit biar akun aman.`)
    console.log(`${C.green} [+] Auto Execute ${C.dim}: Otomatis nyari folder session & jalanin bot.`)
    console.log(`${C.green} [+] Device Select${C.dim}: Ganti device bot via dvcbot.`)
    console.log(`\n${C.bgGreen}${C.black}${C.bright} [!] AUTO CHAT (COMING SOON) ${C.reset}\n`)
    console.log(`${C.yellow} [*] Ketik ${C.white}exit${C.yellow} untuk kembali ke menu utama.${C.reset}\n`)
    return rl.prompt(true)
  }

  if (uiMode === 'device') {
    console.log(C.bgGreen + C.black + C.bright + " [ DEVICE BOT SELECT ] " + C.reset + "\n")
    DEVICES.forEach(d => {
      const active = d.id === CONFIG.deviceId ? ` ${C.bgYellow}${C.black}(ACTIVE)${C.reset}` : '';
      console.log(`  ${C.white}[${d.id}] ${d.name}${active}`)
    })
    console.log(`\n${C.yellow} [*] Ketik angka (1-5) untuk memilih device.${C.reset}`)
    console.log(`${C.yellow} [*] Ketik ${C.white}exit${C.yellow} untuk kembali.${C.reset}\n`)
    return rl.prompt(true)
  }

  if (uiMode === 'nopairing_wa_type') {
    console.log(C.bgYellow + C.black + C.bright + " [ NOPAIRING: PILIH TIPE WA ] " + C.reset + "\n")
    console.log(`  ${C.white}[1] WA Biasa`)
    console.log(`  ${C.white}[2] WA Bisnis`)
    console.log(`\n${C.yellow} [*] Ketik 1 atau 2 untuk memilih.${C.reset}`)
    console.log(`${C.yellow} [*] Ketik ${C.white}exit${C.yellow} untuk batal.${C.reset}\n`)
    return rl.prompt(true)
  }

  if (uiMode === 'nopairing_input') {
    console.log(C.bgYellow + C.black + C.bright + " [ NOPAIRING: MASUKAN NOMOR ] " + C.reset + "\n")
    console.log(` ${C.green} Tipe WA : ${tempWaType === 1 ? 'WA Biasa' : 'WA Bisnis'}`)
    console.log(`\n${C.yellow} [*] Ketik nomor HP (contoh: 628123456789).${C.reset}`)
    console.log(`${C.yellow} [*] Ketik ${C.white}exit${C.yellow} untuk batal.${C.reset}\n`)
    return rl.prompt(true)
  }

  const asciiArt = figlet.textSync('VZX TOOLS V1', { font: 'Slant', horizontalLayout: 'default' })
  console.log(C.green + asciiArt.split('\n').map(line => C.red + line + C.green).join('\n') + C.reset)
  console.log(C.green + '======================================================' + C.reset)
  
  const statusColor = CONFIG.isRunning ? C.green : (bots.length > 0 ? C.yellow : C.red);
  const statusText = CONFIG.isRunning ? 'RUNNING' : (bots.length > 0 ? 'STOPPED' : 'OFFLINE');
  const currentDevice = DEVICES.find(d => d.id === CONFIG.deviceId)?.name || 'Unknown';
  
  console.log(`${C.green} [*] Status: ${statusColor}${statusText}  ${C.green}|  [*] Bot: ${C.white}${bots.length}/10  ${C.green}|  [*] Total Edits: ${C.white}${totalEdits}`)
  console.log(`${C.green} [*] Teks: ${C.white}"${CONFIG.editText}"  ${C.green}|  [*] Delay: ${C.white}${CONFIG.delay}ms`)
  console.log(`${C.green} [*] Device: ${C.white}${currentDevice}`)
  console.log(C.green + '======================================================' + C.reset)
  
  console.log(`${C.cyan} [ MENU COMMANDS ]:`)
  console.log(`  ${C.white}start            ${C.dim}- Mulai auto-edit & auto-reject`)
  console.log(`  ${C.white}stop             ${C.dim}- Hentikan bot yang sedang jalan`)
  console.log(`  ${C.white}pairing <no>     ${C.dim}- Pairing manual pake kode`)
  console.log(`  ${C.white}nopairing        ${C.dim}- Setup koneksi WA tanpa pairing code`)
  console.log(`  ${C.white}editpsn <teks>   ${C.dim}- Ganti teks edit`)
  console.log(`  ${C.white}delay <ms>       ${C.dim}- Ubah delay edit`)
  console.log(`  ${C.white}dvcbot           ${C.dim}- Ganti device bot (5 pilihan)`)
  console.log(`  ${C.white}saveconfig       ${C.dim}- Simpan konfigurasi ke file`)
  console.log(`  ${C.white}note             ${C.dim}- Lihat detail fitur bot`)
  console.log(`  ${C.white}exit              ${C.dim}- Matikan tools`)
  console.log(C.green + '======================================================' + C.reset)
  
  console.log(`${C.bright}${C.white} [ REALTIME LOG ]${C.reset}`)
  console.log(C.white + '------------------------------------------------------' + C.reset)
  const height = process.stdout.rows || 24
  const logHeight = Math.max(5, height - 30)
  const visibleLogs = logs.slice(-logHeight)
  visibleLogs.forEach(l => console.log(l))
  console.log(C.white + '------------------------------------------------------' + C.reset)
  
  rl.prompt(true)
}

function addLog(msg) {
  const time = new Date().toLocaleTimeString('en-GB')
  logs.push(`${C.dim}[${time}]${C.reset} ${msg}`)
  if (uiMode === 'main') redraw()
}

async function connectWA(phone, isPairing = false) {
  if (bots.length >= 10) return addLog(`${C.red}[!] Limit maksimal 10 bot tercapai!${C.reset}`)
  
  const existingBot = bots.find(b => b.phone === phone)
  if (existingBot) {
    if (existingBot.isConnected) return addLog(`${C.red}[!] Nomor ${phone} sudah terhubung.${C.reset}`)
    else bots = bots.filter(b => b.phone !== phone)
  }

  const authDir = path.join(__dirname, `auth_${phone}`)
  if (!fs.existsSync(authDir) && !isPairing) {
    return addLog(`${C.red}[!] Gagal: Session untuk nomor ${phone} tidak ditemukan.${C.reset}`)
  }

  const { state, saveCreds } = useJSONAuthState(authDir)
  const { version } = await fetchLatestWaWebVersion()
  const selectedBrowser = DEVICES.find(d => d.id === CONFIG.deviceId)?.browser || Browsers.macOS('Chrome')
  
  const sock = makeWASocket({
    version, auth: state, logger: P({ level: 'silent' }),
    printQRInTerminal: false, browser: selectedBrowser,
    syncFullHistory: false, shouldSyncHistoryMessage: () => false
  })

  const botData = { phone, sock, isConnected: false, temp: true }

  sock.ev.on('creds.update', saveCreds)

  if (!sock.authState.creds.registered && isPairing) {
    sock.ev.on('connection.update', async (u) => {
      if (u.qr) {
        try {
          const code = await sock.requestPairingCode(phone)
          addLog(`${C.bgGreen}${C.black} [PAIRING CODE]: ${code} ${C.reset}`)
        } catch (e) { addLog(`${C.red}[err ${phone}] ${e.message}${C.reset}`); }
      }
    })
  }

  sock.ev.on('connection.update', (u) => {
    if (u.connection === 'open') {
      botData.isConnected = true
      if (botData.temp) {
        botData.temp = false
        bots.push(botData)
      }
      addLog(`${C.green}[CONN ${phone}] Berhasil terhubung!${C.reset}`)
    }
    
    if (u.connection === 'close') {
      const code = new Boom(u.lastDisconnect?.error)?.output?.statusCode
      
      if (!botData.isConnected) {
        addLog(`${C.red}[FAIL ${phone}] Gagal konek. Nomor tidak valid atau sesi expired.${C.reset}`)
        bots = bots.filter(b => b.phone !== phone)
      } else if (code !== DisconnectReason.loggedOut) {
        addLog(`${C.yellow}[RECONN ${phone}] Koneksi putus, nyambung ulang...${C.reset}`)
        setTimeout(() => connectWA(phone, false), 3000)
      } else {
        addLog(`${C.red}[LOGOUT ${phone}] Terhapus dari daftar.${C.reset}`)
        bots = bots.filter(b => b.phone !== phone)
      }
    }
  })

  sock.ev.on('call', async (calls) => {
    if (!CONFIG.isRunning) return
    for (const call of calls) {
      if (call.status === 'offer') {
        try {
          await sock.rejectCall(call.id, call.from)
          addLog(`${C.red}[CALL REJECT]${C.reset} ${call.from.split('@')[0]}`)
        } catch (e) { addLog(`${C.red}[CALL ERR]${C.reset} ${e.message}`) }
      }
    }
  })

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify' || !CONFIG.isRunning) return
    for (const m of messages) {
      if (!m.key?.remoteJid || m.key.remoteJid === 'status@broadcast' || m.message?.protocolMessage) continue
      
      if (m.key.fromMe) {
        let originalText = m.message?.conversation || m.message?.extendedTextMessage?.text || "[Media]"
        if (originalText.length > 30) originalText = originalText.substring(0, 30) + "..."

        setTimeout(async () => {
          try {
            await sock.sendMessage(m.key.remoteJid, { text: CONFIG.editText, edit: m.key })
            totalEdits++
            addLog(`${C.cyan}[EDIT ${phone}]${C.reset} "${originalText}" -> "${CONFIG.editText}"`)
          } catch (e) {}
        }, CONFIG.delay)
      }
    }
  })
}

process.on('SIGINT', () => { 
  if (uiMode === 'main') addLog(`${C.red}[!] ketik exit untuk keluar!${C.reset}`) 
});
redraw()

const files = fs.readdirSync(__dirname)
const authFolders = files.filter(f => f.startsWith('auth_') && fs.statSync(path.join(__dirname, f)).isDirectory())

if (authFolders.length > 0) {
  addLog(`${C.yellow}[*] Ditemukan ${authFolders.length} session tersimpan. Auto-executing...${C.reset}`)
  authFolders.forEach(folder => {
    const phone = folder.replace('auth_', '')
    connectWA(phone, false)
  })
} else {
  addLog(`${C.yellow}[*] Tidak ada session ditemukan. Silakan ketik 'pairing <nomor>' atau 'nopairing'.${C.reset}`)
}

rl.on('line', async (line) => {
  let raw = line.trim()

  if (uiMode !== 'main') {
    if (raw.toLowerCase() === 'exit') {
      uiMode = 'main'
      tempPhone = null; tempWaType = null;
      redraw()
    } 
    else if (uiMode === 'device' && /^[1-5]$/.test(raw)) {
      CONFIG.deviceId = parseInt(raw)
      saveConfigToFile()
      uiMode = 'main'
      addLog(`${C.green}[*] Device bot diganti ke: ${DEVICES.find(d => d.id === CONFIG.deviceId).name}${C.reset}`)
    }
    else if (uiMode === 'nopairing_wa_type') {
      if (raw === '1' || raw === '2') {
        tempWaType = parseInt(raw)
        uiMode = 'nopairing_input'
        redraw()
      } else {
        addLog(`${C.red}[!] Pilihan tidak valid. Ketik 1 atau 2.${C.reset}`)
        redraw()
      }
    }
    else if (uiMode === 'nopairing_input') {
      const phone = raw.replace(/[^0-9]/g, '')
      if (!phone || phone.length < 10 || phone.length > 15) {
        addLog(`${C.red}[!] Nomor tidak valid! Pastikan format benar (10-15 digit).${C.reset}`)
        redraw()
      } else {
        uiMode = 'main'
        addLog(`${C.green}[*] Memproses nomor ${phone}...${C.reset}`)
        await connectWA(phone, false)
        tempWaType = null;
      }
    }
    else {
      rl.prompt()
    }
    return
  }

  if (raw.toLowerCase() === 'exit') {
    console.clear()
    console.log(`${C.red} [*] Mematikan tools...${C.reset}`)
    process.exit(0)
  }

  const cleanRaw = raw.replace(/^#/, '')
  const args = cleanRaw.split(' ')
  const cmd = args[0].toLowerCase()

  if (cmd === 'note') { uiMode = 'note'; redraw(); }
  else if (cmd === 'dvcbot') { uiMode = 'device'; redraw(); }
  else if (cmd === 'nopairing') { 
    uiMode = 'nopairing_wa_type'; 
    addLog(`${C.yellow}[*] Membuka menu Nopairing...${C.reset}`);
    redraw(); 
  }
  else if (cmd === 'pairing') {
    if (!args[1]) return addLog(`${C.red}[!] Format: pairing <nomor>${C.reset}`)
    const phone = args[1].replace(/[^0-9]/g, '')
    addLog(`${C.yellow}[*] Meminta kode pairing untuk ${phone}...${C.reset}`)
    await connectWA(phone, true)
  }
  else if (cmd === 'start') {
    if (bots.length === 0) return addLog(`${C.red}[!] Belum ada bot. Setup dulu.${C.reset}`)
    if (CONFIG.isRunning) return addLog(`${C.yellow}[!] Bot sudah berjalan.${C.reset}`)
    CONFIG.isRunning = true
    addLog(`${C.green}[*] Bot dijalankan.${C.reset}`)
  }
  else if (cmd === 'stop') {
    if (!CONFIG.isRunning) return addLog(`${C.red}[!] Belum mulai bot.${C.reset}`)
    CONFIG.isRunning = false
    addLog(`${C.red}[*] Bot dihentikan.${C.reset}`)
  }
  else if (cmd === 'editpsn') {
    const newText = cleanRaw.slice(cleanRaw.indexOf(' ') + 1).trim()
    CONFIG.editText = newText === '' ? "Masukan teks..." : newText
    addLog(`${C.green}[*] Teks edit diganti: "${CONFIG.editText}"${C.reset}`)
  } 
  else if (cmd === 'delay') {
    const d = parseInt(args[1])
    if(!isNaN(d)) { CONFIG.delay = d; addLog(`${C.green}[*] Delay diubah: ${d}ms${C.reset}`) }
    else addLog(`${C.red}[!] Format: delay 2000${C.reset}`)
  } 
  else if (cmd === 'saveconfig') {
    let changes = []
    for (let key in CONFIG) {
      if (key !== 'isRunning' && CONFIG[key] !== prevConfig[key]) {
        changes.push(`${key}: "${prevConfig[key]}" -> "${CONFIG[key]}"`)
      }
    }
    saveConfigToFile()
    if (changes.length > 0) addLog(`${C.green}[*] Config disimpan ke file.${C.reset}\n${changes.map(x => `  ${C.dim}${x}${C.reset}`).join('\n')}`)
    else addLog(`${C.green}[*] Config disimpan (Tidak ada perubahan).${C.reset}`)
  }
  else {
    addLog(`${C.red}[!] Command tidak dikenal.${C.reset}`)
  }
})
