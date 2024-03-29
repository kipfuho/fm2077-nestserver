const CryptoJS = require('crypto-js')

const data = {username:"root", email: "root@root.com", salt:CryptoJS.lib.WordArray.random(16).toString(CryptoJS.enc.Hex), exp: new Date().getTime() + 10*1000};

const key = CryptoJS.lib.WordArray.random(32).toString(CryptoJS.enc.Hex);
const iv  = CryptoJS.lib.WordArray.random(32).toString(CryptoJS.enc.Hex)

var encrypted = CryptoJS.AES.encrypt(JSON.stringify(data), key, {iv: iv});
console.log(encrypted.toString());
var encrypted = CryptoJS.AES.encrypt(JSON.stringify(data), key, {iv: iv});
console.log(encrypted.toString());
var encrypted = CryptoJS.AES.encrypt(JSON.stringify(data), key, {iv: iv});
console.log(encrypted.toString());
var decrypted = CryptoJS.AES.decrypt(encrypted.toString(), key, {iv: iv});
console.log(JSON.parse(decrypted.toString(CryptoJS.enc.Utf8)));
