const { Client } = require('whatsapp-web.js');
const express = require('express');
const { body, validationResult } = require('express-validator');
const socketIO = require('socket.io');
const qrcode = require('qrcode');
const http = require('http');
const fs = require('fs');
const { phoneNumberFormatter } = require('./helpers/formatter');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

app.use(express.json());
app.use(express.urlencoded({ extended: true}));

const SESSION_FILE_PATH = './whatsapp-session.json';
let sessionCfg;
if (fs.existsSync(SESSION_FILE_PATH)) {
    sessionCfg = require(SESSION_FILE_PATH);
}

//menampilkan hello world
// app.get('/',(req, res) => {
//     res.status(200).json({
//         status: true,
//         message: 'Not Just hello world !'
//     });
// });

app.get('/',(req, res) => {
    res.sendFile('index.html',{ root: __dirname });
});


const client = new Client({ 
    puppeteer: {         
        headless: true, 
        //Setingan agar proses tidak berjalan banyak
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            //'--single-process', // <- this one doesn't works in Windows
            '--disable-gpu'
          ],
        },
         session: sessionCfg
 });

//Pindah ke client socket
// client.on('authenticated', (session) => {
//     console.log('AUTHENTICATED', session);
//     sessionCfg=session;
//     fs.writeFile(SESSION_FILE_PATH, JSON.stringify(session), function (err) {
//         if (err) {
//             console.error(err);
//         }
//     });
// });

client.on('message', msg => {
    if (msg.body == '!ping') {
        msg.reply('pong');
    } else if (msg.body == 'good morning'){
        msg.reply('selamat pagi');
    }
});

client.initialize();

// Socket IO
io.on('connection', function(socket){
    socket.emit('message', 'Connecting....');

    client.on('qr', (qr) => {
        // Generate and scan this code with your phone
        console.log('QR RECEIVED', qr);
        //qrcode.generate(qr);
        qrcode.toDataURL(qr,(err, url) => {
            socket.emit('qr', url);
            socket.emit('message', 'Qr Code received, scan please !');
        });
    });

    client.on('ready', () => {
        socket.emit('ready', 'Whatsapp is Ready!');
        socket.emit('message', 'Whatsapp is Ready!');
    });

    //Agar tampilan diclent ready
    client.on('authenticated', (session) => {
        socket.emit('authenticated', 'Whatsapp is authenticated!');
        socket.emit('message', 'Whatsapp is authenticated!');
        console.log('AUTHENTICATED', session);
        sessionCfg=session;
        fs.writeFile(SESSION_FILE_PATH, JSON.stringify(session), function (err) {
            if (err) {
                console.error(err);
            }
        });
    });
});

//Mengecek nomor yang ada WA apa tidak
const checkRegisteredNumber = async function(number){
    const isRegistered = await client.isRegisteredUser(number);
    return isRegistered;
}

//send message
app.post('/send-message', [
    body('number').notEmpty(),
    body('message').notEmpty(),
], async (req, res) => {
    const erors = validationResult(req).formatWith(({ msg }) => {
        return  msg;
    });

    if (!erors.isEmpty()){
        return res.status(422).json({
            status: false,
            message: errors.mapped()
        })
    }


    //const number = req.body.number;
    //Menggunakan helper formatter
    const number = phoneNumberFormatter(req.body.number);
    const message = req.body.message;

    //Cek Number Ada WA atau belum sebelum pesan dikirim
    const isRegisteredNumber = await checkRegisteredNumber(number);

    if (!isRegisteredNumber){
        return res.status(422).json({
            status: false,
            message: 'The Number is not registered'
        })
    }

    client.sendMessage(number, message).then(response => {
        res.status(200).json({
            status: true,
            response: response
        });
    }).catch(err =>{
        res.status(500).json({
            status:false,
            response: err
        });
    });
});

server.listen(8000, function() {
    console.log('App Running on *:'+ 8000);
});