import hashlib
import mysql.connector
from datetime import datetime
from flask import Flask, render_template, request, redirect, url_for, session, make_response
from flask_socketio import SocketIO, emit, join_room, leave_room

# --- KONFIGURASI APLIKASI & DATABASE ---
app = Flask(__name__)
app.config['SECRET_KEY'] = 'kunci_rahasia_super_aman_ini_harus_diganti_di_produksi'
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')

DB_CONFIG = {
    'host': 'localhost',
    'user': 'root',
    'password': '',
    'database': 'chat_app_db'
}

# --- Fungsi Database ---
def get_db_connection():
    return mysql.connector.connect(**DB_CONFIG)

def hash_password(password):
    return hashlib.sha256(password.encode()).hexdigest()

def register_user(username, password):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        hashed_pass = hash_password(password)
        sql = "INSERT INTO users (username, password_hash) VALUES (%s, %s)"
        cursor.execute(sql, (username, hashed_pass))
        conn.commit()
        print(f"[DB] Pengguna {username} berhasil didaftarkan.")
        return True
    except mysql.connector.Error as err:
        print(f"[DB ERROR] Pendaftaran gagal: {err}")
        return False
    finally:
        cursor.close()
        conn.close()

def verify_login(username, password):
    conn = get_db_connection()
    cursor = conn.cursor()
    sql = "SELECT id, password_hash FROM users WHERE username = %s"
    cursor.execute(sql, (username,))
    result = cursor.fetchone()
    cursor.close()
    conn.close()
    if result:
        user_id, stored_hash = result
        if stored_hash == hash_password(password):
            print(f"[DB] Pengguna {username} berhasil login.")
            return user_id
    print(f"[DB] Login gagal untuk {username}.")
    return None

def get_user_id_by_username(username):
    conn = get_db_connection()
    cursor = conn.cursor()
    sql = "SELECT id FROM users WHERE username = %s"
    cursor.execute(sql, (username,))
    result = cursor.fetchone()
    cursor.close()
    conn.close()
    return result[0] if result else None

def get_username_by_id(user_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    sql = "SELECT username FROM users WHERE id = %s"
    cursor.execute(sql, (user_id,))
    result = cursor.fetchone()
    cursor.close()
    conn.close()
    return result[0] if result else None

def save_message(sender_id, receiver_id, encrypted_message):
    conn = get_db_connection()
    cursor = conn.cursor()
    # Hapus 'timestamp' dari daftar kolom dan '%s' terakhir dari VALUES
    sql = "INSERT INTO messages (sender_id, receiver_id, encrypted_message) VALUES (%s, %s, %s)"
    # Hapus datetime.now() dari tuple parameter
    cursor.execute(sql, (sender_id, receiver_id, encrypted_message))
    conn.commit()
    print(f"[DB] Pesan dari {sender_id} ke {receiver_id} disimpan.")
    cursor.close()
    conn.close()

# --- NEW: Fungsi untuk mengambil riwayat chat dari database ---
def get_chat_history_from_db(user1_id, user2_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        # Mengambil pesan yang dikirim dari user1 ke user2 ATAU dari user2 ke user1
        sql = """
            SELECT sender_id, receiver_id, encrypted_message, timestamp
            FROM messages
            WHERE (sender_id = %s AND receiver_id = %s)
            OR (sender_id = %s AND receiver_id = %s)
            ORDER BY timestamp ASC
        """
        cursor.execute(sql, (user1_id, user2_id, user2_id, user1_id))
        history = []
        for row in cursor.fetchall():
            sender_id_msg = row[0]
            # receiver_id_msg = row[1] # Tidak dipakai langsung di sini
            encrypted_msg = row[2]
            timestamp_dt = row[3] # Objek datetime
            
            sender_username_msg = get_username_by_id(sender_id_msg)
            # receiver_username_msg = get_username_by_id(receiver_id_msg) # Tidak dipakai langsung di sini

            # Format timestamp ke string yang konsisten dengan yang di-emit
            timestamp_str = timestamp_dt.strftime("%H:%M:%S %d-%m-%Y")
            
            history.append({
                'sender': sender_username_msg,
                'encrypted_msg': encrypted_msg,
                'timestamp': timestamp_str
            })
        print(f"[DB] Riwayat chat antara ID {user1_id} dan ID {user2_id} diambil. Jumlah pesan: {len(history)}")
        return history
    except mysql.connector.Error as err:
        print(f"[DB ERROR] Gagal mengambil riwayat chat: {err}")
        return []
    finally:
        cursor.close()
        conn.close()

# --- Manajemen Klien Online via SocketIO ---
online_users = {} # {username: sid}

# --- ROUTES APLIKASI WEB (HTTP) ---

@app.route('/')
def index():
    if 'username' in session:
        return redirect(url_for('chat'))
    return render_template('login.html')

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username = request.form['username']
        password = request.form['password']
        user_id = verify_login(username, password)
        if user_id:
            session['user_id'] = user_id
            session['username'] = username
            print(f"[DEBUG LOGIN] Session setelah login: {session.get('username')}, User ID: {session.get('user_id')}")
            return redirect(url_for('chat'))
        else:
            print(f"[DEBUG LOGIN] Login gagal untuk {username}.")
            return render_template('login.html', error="Username atau password salah")
    print(f"[DEBUG LOGIN] Menampilkan halaman login (GET request).")
    return render_template('login.html')

@app.route('/register', methods=['GET', 'POST'])
def register():
    if request.method == 'POST':
        username = request.form['username']
        password = request.form['password']
        if register_user(username, password):
            return redirect(url_for('login', success="Registrasi berhasil! Silakan login."))
        else:
            return render_template('register.html', error="Username sudah ada atau terjadi kesalahan")
    return render_template('register.html')

@app.route('/logout')
def logout():
    username = session.pop('username', None)
    if username in online_users:
        del online_users[username]
    session.pop('user_id', None)
    socketio.emit('user_list_update', list(online_users.keys()))
    print(f"[LOGOUT] {username} logged out. online_users: {online_users}")
    response = make_response(redirect(url_for('login')))
    response.set_cookie('session', '', expires=0, httponly=True, samesite='Lax')
    return response

@app.route('/chat')
def chat():
    if 'username' not in session:
        print(f"[DEBUG CHAT] Pengguna tidak di sesi, redirect ke login. Session: {session.get('username')}")
        return redirect(url_for('login'))
    
    print(f"[DEBUG CHAT] Menampilkan halaman chat untuk: {session['username']}")
    response = make_response(render_template('chat.html', username=session['username']))
    response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response

# --- SOCKETIO EVENT HANDLERS (WebSocket) ---

@socketio.on('connect')
def handle_connect():
    print(f"[DEBUG CONNECT] Percobaan koneksi SocketIO dari SID: {request.sid}")
    print(f"[DEBUG CONNECT] Session saat connect: {session.get('username')}, User ID: {session.get('user_id')}")
    if 'username' in session and 'user_id' in session: # Pastikan user_id juga ada
        username = session['username']
        user_id = session['user_id']
        sid = request.sid
        
        # Cek jika pengguna sudah online dengan SID lain
        if username in online_users:
            old_sid = online_users[username]
            if old_sid != sid:
                # Opsional: Kirim pesan ke SID lama atau putuskan
                socketio.emit('force_logout', {'message': 'Anda login di tempat lain.'}, room=old_sid)
                print(f"[SOCKETIO] SID lama untuk {username} ({old_sid}) ditimpa oleh SID baru ({sid}).")

        online_users[username] = sid
        join_room(username) # Buat room privat untuk user ini
        print(f"[SOCKETIO] {username} (ID: {user_id}) terhubung (SID: {sid}). Total online: {len(online_users)}")
        print(f"[DEBUG CONNECT] online_users saat ini: {online_users}")
        
        # Beri tahu semua klien yang online tentang update daftar pengguna
        emit('user_list_update', list(online_users.keys()), broadcast=True)
    else:
        print(f"[SOCKETIO] Koneksi tanpa sesi dari {request.sid}, memutuskan.")
        emit('force_logout', {'message': 'Sesi Anda tidak valid. Silakan login kembali.'})
        return False

@socketio.on('disconnect')
def handle_disconnect():
    username_disconnected = None
    for user, sid in list(online_users.items()):
        if sid == request.sid:
            username_disconnected = user
            del online_users[user]
            break
    if username_disconnected:
        leave_room(username_disconnected)
        print(f"[SOCKETIO] {username_disconnected} terputus. Total online: {len(online_users)}")
        emit('user_list_update', list(online_users.keys()), broadcast=True)

@socketio.on('send_message')
def handle_send_message(data):
    if 'username' not in session or 'user_id' not in session:
        emit('error', 'Anda harus login untuk mengirim pesan.')
        return

    sender_username = session['username']
    sender_id = session['user_id'] # Ambil sender_id dari sesi
    
    receiver_username = data.get('receiver_username')
    encrypted_message = data.get('encrypted_message')

    receiver_user_id = get_user_id_by_username(receiver_username) # Dapatkan receiver_id

    if receiver_user_id:
        # Simpan pesan ke database
        save_message(sender_id, receiver_user_id, encrypted_message) # Gunakan sender_id dan receiver_id
        
        current_timestamp = datetime.now().strftime("%H:%M:%S %d-%m-%Y")

        print(f"[DEBUG SERVER] Mengirim pesan dari {sender_username} ke {receiver_username}. Data: {{'sender': '{sender_username}', 'encrypted_msg': '{encrypted_message}', 'timestamp': '{current_timestamp}'}}")

        # Kirim pesan ke penerima yang online
        if receiver_username in online_users:
            emit('msg_received', {
                'sender': sender_username,
                'encrypted_msg': encrypted_message,
                'timestamp': current_timestamp
            }, room=receiver_username)
            print(f"[SERVER] Meneruskan pesan terenkripsi dari {sender_username} ke {receiver_username} (online).")
            emit('status_message', f"Pesan terkirim ke {receiver_username}.")
        else:
            print(f"[SERVER] Pesan terenkripsi dari {sender_username} ke {receiver_username} disimpan (offline).")
            emit('status_message', f"Pesan disimpan untuk {receiver_username} (offline).")
    else:
        emit('error', f"Pengguna {receiver_username} tidak ditemukan.")

# --- NEW: Event handler untuk permintaan riwayat chat ---
@socketio.on('request_chat_history')
def handle_request_chat_history(data):
    if 'username' not in session or 'user_id' not in session:
        emit('error', 'Anda harus login untuk melihat riwayat chat.')
        return

    current_user_id = session['user_id']
    target_username = data.get('target_username')
    target_user_id = get_user_id_by_username(target_username)

    if target_user_id:
        history = get_chat_history_from_db(current_user_id, target_user_id)
        print(f"[SERVER] Mengirim riwayat chat untuk {session['username']} dengan {target_username}. {len(history)} pesan.")
        emit('chat_history', history) # Kirim daftar objek pesan
    else:
        emit('error', f"Pengguna {target_username} tidak ditemukan untuk riwayat chat.")


@socketio.on('request_users')
def handle_request_users():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT username FROM users")
    all_users = [row[0] for row in cursor.fetchall()]
    cursor.close()
    conn.close()
    emit('all_users_list', all_users)
    emit('online_users_list', list(online_users.keys()))

if __name__ == '__main__':
    print("[*] Memulai server web di http://127.0.0.1:5000")
    socketio.run(app, host='127.0.0.1', port=5000, debug=True)