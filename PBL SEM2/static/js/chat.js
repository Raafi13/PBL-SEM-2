// static/js/chat.js

const socket = io();
const messagesDiv = document.getElementById('messages');
const messageInput = document.getElementById('message-input');
const sendButton = document.getElementById('send-button');
const onlineUsersList = document.getElementById('online-users');
const allUsersList = document.getElementById('all_users');
const currentChatUserSpan = document.getElementById('current-chat-user');
const statusMessageP = document.getElementById('status-message');
const errorMessageP = document.getElementById('error-message');

let selectedReceiver = null; // Username penerima yang sedang dipilih

function displayMessage(sender, msg, timestamp, type = 'received') {
    console.log(`[DEBUG CLIENT] displayMessage dipanggil. Sender: ${sender}, Timestamp: ${timestamp}, Type: ${type}`); 
    
    const bubble = document.createElement('div');
    bubble.classList.add('message-bubble', type);
    
    const content = document.createElement('p');
    const currentLoggedInUser = document.getElementById('logged-in-username').dataset.username;
    const displaySender = (sender === currentLoggedInUser && type === 'sent') ? "Anda" : sender;
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
    socket.emit('request_users');
    selectedReceiver = null; // Reset this on new connection
});

socket.on('user_list_update', (onlineUsers) => {
    console.log('Online users updated:', onlineUsers);
    onlineUsersList.innerHTML = '';
    const currentLoggedInUser = document.getElementById('logged-in-username').dataset.username; 
    
    let firstSelectableUser = null;
    
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

            if (!firstSelectableUser) {
                firstSelectableUser = user;
            }
        }
    });

    if (!selectedReceiver && firstSelectableUser) {
        console.log(`[DEBUG CLIENT] Auto-selecting first online user: ${firstSelectableUser}`);
        selectReceiver(firstSelectableUser);
    }
});

socket.on('all_users_list', (allUsers) => {
    console.log('All users list received:', allUsers);
    allUsersList.innerHTML = '';
    const currentLoggedInUser = document.getElementById('logged-in-username').dataset.username;

    let firstSelectableUserFromAll = null; // Gunakan variabel berbeda agar tidak bentrok dengan online

    allUsers.forEach(user => {
        if (user !== currentLoggedInUser) {
            const isOnline = Array.from(onlineUsersList.children).some(item => item.textContent.includes(user));
            
            if (!isOnline) { // Hanya tambahkan jika belum ada di daftar online
                const li = document.createElement('li');
                li.textContent = user;
                if (selectedReceiver === user) {
                    li.classList.add('selected');
                }
                li.onclick = () => selectReceiver(user);
                allUsersList.appendChild(li);
            }

            // Jika belum ada user yang terpilih, dan belum ada user dari online_users_list yang dipilih,
            // maka ambil user ini sebagai kandidat auto-select
            // Penting: hanya jika selectedReceiver masih null DAN (firstSelectableUser dari online_users_list juga null ATAU sudah diproses)
            if (!selectedReceiver && !document.querySelector('#online-users li.selected')) { 
                if (!firstSelectableUserFromAll) {
                    firstSelectableUserFromAll = user;
                }
            }
        }
    });

    // Panggil auto-select jika belum ada yang terpilih sama sekali, dan ada kandidat dari all_users
    // Ini akan dieksekusi hanya jika auto-select dari user_list_update tidak menemukan siapa pun
    if (!selectedReceiver && firstSelectableUserFromAll) {
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

    const currentLoggedInUser = document.getElementById('logged-in-username').dataset.username;
    // Tampilkan jika pengirim adalah lawan chat yang sedang aktif
    // ATAU jika itu pesan yang baru saja kita kirim (konfirmasi dari server)
    if (sender === selectedReceiver) {
        displayMessage(sender, encryptedMsg, timestamp, 'received');
    } else if (sender === currentLoggedInUser && data.receiver === selectedReceiver) {
        // Ini adalah pesan yang baru saja kita kirim, server mengirimnya kembali ke kita juga.
        // Hanya tampilkan jika kita sedang chat dengan receiver tersebut.
        displayMessage("Anda", encryptedMsg, timestamp, 'sent');
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
        const currentLoggedInUser = document.getElementById('logged-in-username').dataset.username;
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

    document.querySelectorAll('.user-list li').forEach(item => {
        item.classList.remove('selected');
    });
    const selectedLi = document.querySelector(`#online-users li[onclick*="${username}"], #all_users li[onclick*="${username}"]`);
    if (selectedLi) {
        selectedLi.classList.add('selected');
    }
    
    messagesDiv.innerHTML = '';
    showStatus(`Anda sekarang chat dengan ${username}`);

    socket.emit('request_chat_history', { target_username: username });
}

sendButton.addEventListener('click', () => {
    sendMessage();
});

messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
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
            timestamp: currentTimestamp
        });
        
        displayMessage("Saya", encryptedMessage, currentTimestamp, 'sent');
        messageInput.value = '';
    } else if (!selectedReceiver) {
        showStatus("Pilih pengguna terlebih dahulu!", true);
    } else if (!message) {
        showStatus("Pesan tidak boleh kosong!", true);
    }
}