// Memastikan bahwa DOM (Document Object Model) telah dimuat sepenuhnya
document.addEventListener('DOMContentLoaded', function() {
    // Mendapatkan elemen form registrasi berdasarkan ID-nya
    const registrationForm = document.getElementById('registrationForm');
    // Mendapatkan elemen input password berdasarkan ID-nya
    const passwordInput = document.getElementById('passwordInput');

    // Menambahkan event listener untuk saat form disubmit
    registrationForm.addEventListener('submit', function(event) {
        // Mendapatkan nilai password dari input
        const password = passwordInput.value;

        // Memeriksa apakah panjang password kurang dari 8 karakter
        if (password.length < 8) {
            // Mencegah pengiriman form ke server
            event.preventDefault();
            // Menampilkan pesan peringatan kepada pengguna
            alert('Password harus memiliki minimal 8 karakter!');
            // Fokuskan kembali ke input password agar pengguna bisa langsung memperbaikinya
            passwordInput.focus();
        }
        // Jika password valid (panjangnya 8 atau lebih), form akan diteruskan untuk dikirim
    });
});
