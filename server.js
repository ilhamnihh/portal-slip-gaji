
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const app = express();

// Konfigurasi Supabase
const SUPABASE_URL = 'https://vcasurmurhbtlnxrqkdi.supabase.co'; 
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZjYXN1cm11cmhidGxueHJxa2RpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAzMTIxMzYsImV4cCI6MjEwNTg4ODEzNn0.REy2C3gsZqK-7zbmorYDvIVubpfxN9tyW0ojoodshGc'; 

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

if (!fs.existsSync('./uploads')) {
    fs.mkdirSync('./uploads');
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + '-' + file.originalname);
    }
});
const upload = multer({ storage: storage });

// API Login
app.post('/api/login', async (req, res) => {
    try {
        const { employee_id, password } = req.body;
        console.log(`> Mencoba login untuk ID: "${employee_id}"`);
        
        const { data: users, error } = await supabase
            .from('users')
            .select('*')
            .eq('employee_id', employee_id)
            .eq('password', password);

        if (error) {
            console.log("❌ Error dari Supabase:", error.message);
            // ... lanjutkan sisa kode kamu di bawahnya ...
        }

        if (error || !users || users.length === 0) {
            return res.status(401).json({ success: false, message: 'ID Karyawan atau Password salah!' });
        }

        console.log("✅ Login Berhasil untuk:", users[0].full_name);
        res.json({ success: true, user: users[0] });
    } catch (err) {
        console.log("❌ Server Error:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// API Get Employees
app.get('/api/employees', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('role', 'employee');

        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// API Add Employee
app.post('/api/employees', async (req, res) => {
    try {
        const { employee_id, password, full_name, position } = req.body;
        
        // Cek apakah ID sudah terdaftar
        const { data: existing } = await supabase
            .from('users')
            .select('*')
            .eq('employee_id', employee_id)
            .single();

        if (existing) {
            return res.status(400).json({ success: false, message: 'ID Karyawan sudah terdaftar!' });
        }

        const newUser = {
            employee_id,
            password,
            full_name,
            role: 'employee',
            position: position || 'Staff'
        };

        const { data, error } = await supabase
            .from('users')
            .insert([newUser])
            .select()
            .single();

        if (error) throw error;

        res.json({ success: true, message: 'Karyawan berhasil ditambahkan!', user: data });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// API Upload Multiple PDF Slips dengan Pencocokan Otomatis
app.post('/api/upload-slips', upload.array('slip_files'), async (req, res) => {
    try {
        const { month, year } = req.body;
        const files = req.files;

        if (!files || files.length === 0) {
            return res.status(400).json({ success: false, message: 'Tidak ada file PDF yang diunggah!' });
        }

        // Ambil semua data karyawan dari Supabase
        const { data: users, error: userError } = await supabase
            .from('users')
            .select('*')
            .eq('role', 'employee');

        if (userError) throw userError;

        let successCount = 0;
        let slipsToInsert = [];

        files.forEach((file) => {
            const fileNameClean = file.originalname.toLowerCase();

            const targetEmp = users.find(u => {
                const empIdClean = u.employee_id.toLowerCase();
                const empNameClean = u.full_name.toLowerCase().replace(/\s+/g, '');
                return fileNameClean.includes(empIdClean) || fileNameClean.includes(empNameClean);
            });

            if (targetEmp) {
                slipsToInsert.push({
                    employee_id: targetEmp.employee_id,
                    month: month || 'Januari',
                    year: year ? parseInt(year) : 2026,
                    file_url: `/uploads/${file.filename}`,
                    file_name: file.originalname
                });
                successCount++;
            }
        });

        if (slipsToInsert.length > 0) {
            const { error: insertError } = await supabase
                .from('salary_slips')
                .insert(slipsToInsert);

            if (insertError) throw insertError;

            res.json({ success: true, message: `${successCount} dari ${files.length} file slip gaji berhasil dicocokkan dan diunggah secara online!` });
        } else {
            res.status(400).json({ success: false, message: 'Gagal mencocokkan nama file dengan ID Karyawan. Pastikan nama file mengandung ID karyawan.' });
        }
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// API Get Slips
app.get('/api/slips', async (req, res) => {
    try {
        const { employee_id, role } = req.query;
        
        let query = supabase.from('salary_slips').select('*');

        if (role !== 'admin' && employee_id) {
            query = query.eq('employee_id', employee_id);
        }

        const { data, error } = await query;

        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server berjalan di http://localhost:${PORT}`);
});