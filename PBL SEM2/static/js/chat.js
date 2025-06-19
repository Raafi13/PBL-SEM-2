// static/js/chat.js

const socket = io();
const messagesDiv = document.getElementById('messages');
const messageInput = document.getElementById('message-input');
const sendButton = document.getElementById('send-button');
const onlineUsersList = document.getElementById('online-users'); // Correct ID
const allUsersList = document.getElementById('all-users'); // Corrected ID from 'all_users' to 'all-users'
const currentChatUserSpan = document.getElementById('current-chat-user');
const statusMessageP = document.getElementById('status-message');
const errorMessageP = document.getElementById('error-message');

// Pastikan elemen ini ada di HTML Anda, seperti yang ditambahkan di atas.
const currentLoggedInUserElement = document.getElementById('logged-in-username');
let currentLoggedInUser = null;
if (currentLoggedInUserElement) {
    currentLoggedInUser = currentLoggedInUserElement.dataset.username;
} else {
    console.error("Elemen 'logged-in-username' tidak ditemukan di HTML.");
    // Handle this error appropriately, perhaps redirect to login or show an error.
}


let selectedReceiver = null; // Username penerima yang sedang dipilih

// Fungsi sederhana untuk enkripsi/dekripsi (Anda bisa mengganti ini dengan implementasi yang lebih kuat)
function encryptMessage(message) {
    // Contoh sederhana: reverse string
    return message.split('').reverse().join('');
}

function decryptMessage(encryptedMessage) {
    // Contoh sederhana: reverse string kembali
    return encryptedMessage.split('').reverse().join('');
}


function displayMessage(sender, msg, timestamp, type = 'received') {
    console.log(`[DEBUG CLIENT] displayMessage dipanggil. Sender: ${sender}, Timestamp: ${timestamp}, Type: ${type}`); 
    
    const bubble = document.createElement('div');
    bubble.classList.add('message-bubble', type);
    
    const content = document.createElement('p');
    // Jika pengirim adalah pengguna yang sedang login, tampilkan "Anda"
    const displaySender = (sender === currentLoggedInUser) ? "Anda" : sender;
    content.innerHTML = `<strong>${displaySender}</strong><br>${decryptMessage(msg)}<br><small class="timestamp">${timestamp}</small>`; 
    
    const encryptedRaw = document.createElement('small');
    encryptedRaw.textContent = `(Enkripsi: ${msg})`;
    encryptedRaw.style.fontSize = '0.7em';
    encryptedRaw.style.color = '#888';
    
    bubble.appendChild(content); 
    bubble.appendChild(encryptedRaw);
    messagesDiv.appendChild(bubble);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function showStatus(message, isError = false) {
    if (isError) {
        errorMessageP.textContent = message;
        statusMessageP.textContent = '';
    } else {
        statusMessageP.textContent = message;
        errorMessageP.textContent = '';
    }
    setTimeout(() => {
        statusMessageP.textContent = '';
        errorMessageP.textContent = '';
    }, 3000);
}

socket.on('connect', () => {
    console.log('Terhubung ke server Socket.IO');
    socket.emit('request_users'); // Minta daftar semua user dan user online
    // selectedReceiver = null; // Ini mungkin tidak perlu direset total, tergantung UI flow Anda
});

socket.on('user_list_update', (onlineUsers) => {
    console.log('[DEBUG CLIENT] Online users updated:', onlineUsers);
    onlineUsersList.innerHTML = ''; // Bersihkan daftar online

    let firstSelectableUser = null; // Untuk auto-select

    onlineUsers.forEach(user => {
        if (user !== currentLoggedInUser) {
            const li = document.createElement('li');
            li.textContent = user + " (online)";
            li.classList.add('online');
            if (selectedReceiver === user) {
                li.classList.add('selected');
            }
            li.onclick = () => selectReceiver(user);
            onlineUsersList.appendChild(li);

            if (!firstSelectableUser && selectedReceiver === null) { // Hanya pilih jika belum ada yang terpilih
                firstSelectableUser = user;
            }
        }
    });

    // Coba auto-select hanya jika belum ada yang terpilih
    if (selectedReceiver === null && firstSelectableUser) {
        console.log(`[DEBUG CLIENT] Auto-selecting first online user: ${firstSelectableUser}`);
        selectReceiver(firstSelectableUser);
    }

    // Setelah memperbarui daftar online, minta daftar semua pengguna lagi
    // Ini membantu memastikan daftar 'All Users' juga diperbarui dengan status online terbaru
    socket.emit('request_users'); 
});


socket.on('all_users_list', (allUsers) => {
    console.log('[DEBUG CLIENT] All users list received:', allUsers);
    allUsersList.innerHTML = ''; // Bersihkan daftar semua pengguna
    
    // Dapatkan daftar username yang sedang online dari DOM
    const currentlyOnlineUsersInDOM = Array.from(onlineUsersList.children)
                                      .map(li => li.textContent.replace(' (online)', ''));

    let firstSelectableUserFromAll = null; 

    allUsers.forEach(user => {
        if (user !== currentLoggedInUser) {
            // Cek apakah user ini sudah ada di daftar online yang baru saja di-render
            const isOnline = currentlyOnlineUsersInDOM.includes(user);
            
            if (!isOnline) { // Hanya tambahkan jika belum ada di daftar online
                const li = document.createElement('li');
                li.textContent = user; // Tidak perlu "(offline)" karena defaultnya memang offline jika tidak di list online
                if (selectedReceiver === user) {
                    li.classList.add('selected');
                }
                li.onclick = () => selectReceiver(user);
                allUsersList.appendChild(li);

                if (!firstSelectableUserFromAll && selectedReceiver === null) {
                    firstSelectableUserFromAll = user;
                }
            }
        }
    });

    // Auto-select dari 'All Users' hanya jika belum ada yang terpilih sama sekali
    // dan auto-select dari 'Online Users' tidak menemukan siapa pun.
    if (selectedReceiver === null && firstSelectableUserFromAll && !document.querySelector('#online-users li.selected')) {
        console.log(`[DEBUG CLIENT] Auto-selecting first available user from all users list: ${firstSelectableUserFromAll}`);
        selectReceiver(firstSelectableUserFromAll);
    }
});

socket.on('msg_received', (data) => {
    console.log('[DEBUG CLIENT] Event msg_received diterima:', data);
    const sender = data.sender;
    const encryptedMsg = data.encrypted_msg;
    const timestamp = data.timestamp;

    if (typeof timestamp === 'undefined' || timestamp === null) {
        console.error('[DEBUG CLIENT ERROR] Timestamp tidak ditemukan dalam data yang diterima untuk pesan real-time!');
    }

    // Jika pengirim adalah lawan chat yang sedang aktif, atau pesan adalah dari diri sendiri ke lawan chat aktif
    if (sender === selectedReceiver) {
        displayMessage(sender, encryptedMsg, timestamp, 'received');
    } else if (sender === currentLoggedInUser && data.receiver === selectedReceiver) {
        // Ini adalah pesan yang baru saja kita kirim, server mengirimnya kembali ke kita juga.
        // Seharusnya sudah ditampilkan oleh sendMessage, jadi ini bisa diabaikan atau sebagai fallback
        // displayMessage("Anda", encryptedMsg, timestamp, 'sent');
        console.log("[DEBUG CLIENT] Pesan sendiri ke selectedReceiver, mungkin duplikat. Abaikan.");
    } else {
        // Pesan masuk dari orang lain yang tidak sedang dalam chat aktif
        showStatus(`Pesan baru dari ${sender}!`);
    }
});

socket.on('status_message', (message) => {
    showStatus(message);
});

socket.on('error', (message) => {
    showStatus(message, true);
});

socket.on('chat_history', (history) => {
    console.log('[DEBUG CLIENT] Riwayat chat diterima:', history);
    messagesDiv.innerHTML = ''; // Bersihkan area chat sebelum menampilkan riwayat

    if (history.length === 0) {
        const noHistory = document.createElement('p');
        noHistory.textContent = "Tidak ada riwayat chat dengan pengguna ini.";
        messagesDiv.appendChild(noHistory);
    } else {
        history.forEach(msg => {
            const sender = msg.sender;
            const encryptedMsg = msg.encrypted_msg;
            const timestamp = msg.timestamp;
            
            const type = (sender === currentLoggedInUser) ? 'sent' : 'received';
            displayMessage(sender, encryptedMsg, timestamp, type);
        });
    }
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
});

function selectReceiver(username) {
    console.log(`[DEBUG CLIENT] Memilih penerima: ${username}`);
    selectedReceiver = username;
    currentChatUserSpan.textContent = `Chat dengan: ${username}`;
    sendButton.disabled = false;
    messageInput.focus();

    // Hapus kelas 'selected' dari semua daftar pengguna
    document.querySelectorAll('.user-list li').forEach(item => {
        item.classList.remove('selected');
    });
    // Tambahkan kelas 'selected' ke LI yang dipilih
    // Gunakan querySelectorAll untuk mencakup kedua list dan ambil yang pertama jika ada duplikat
    const selectedLiElements = document.querySelectorAll(`#online-users li[onclick*="${username}"], #all-users li[onclick*="${username}"]`);
    selectedLiElements.forEach(li => {
        li.classList.add('selected');
    });
    
    messagesDiv.innerHTML = ''; // Bersihkan pesan saat ganti chat
    showStatus(`Anda sekarang chat dengan ${username}`);

    socket.emit('request_chat_history', { target_username: username });
}

sendButton.addEventListener('click', () => {
    sendMessage();
});

messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault(); // Mencegah form submit default jika ada
        sendMessage();
    }
});

socket.on('disconnect', () => {
    console.log('Koneksi Socket.IO terputus. Mengarahkan ke halaman login...');
    showStatus('Koneksi terputus. Silakan login kembali.', true);
    setTimeout(() => {
        window.location.href = '/logout';
    }, 1000);
});

socket.on('force_logout', (data) => {
    console.log('Server meminta logout paksa:', data.message);
    showStatus(data.message || 'Sesi Anda tidak valid. Silakan login kembali.', true);
    setTimeout(() => {
        window.location.href = '/logout';
    }, 1000);
});

function sendMessage() {
    const message = messageInput.value.trim();
    if (message && selectedReceiver) {
        const encryptedMessage = encryptMessage(message);
        
        const now = new Date();
        const currentTimestamp = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')} ${String(now.getDate()).padStart(2, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${now.getFullYear()}`;
        
        socket.emit('send_message', {
            receiver_username: selectedReceiver,
            encrypted_message: encryptedMessage,
            // Timestamp ini hanya untuk tampilan sementara di sisi pengirim.
            // Server akan menyimpan dan mengembalikan timestamp dari DB.
            timestamp: currentTimestamp 
        });
        
        // Tampilkan pesan yang baru dikirim di UI pengirim secara instan
        displayMessage(currentLoggedInUser, encryptedMessage, currentTimestamp, 'sent');
        messageInput.value = '';
    } else if (!selectedReceiver) {
        showStatus("Pilih pengguna terlebih dahulu!", true);
    } else if (!message) {
        showStatus("Pesan tidak boleh kosong!", true);
    }
}

// Pastikan skrip ini dijalankan setelah DOM sepenuhnya dimuat
document.addEventListener('DOMContentLoaded', () => {
    // Meminta daftar pengguna saat DOM dimuat
    socket.emit('request_users');
});