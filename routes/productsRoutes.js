import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import {
    createProduct,
    deleteProduct,
    getProducts,
    updateProduct
} from '../controllers/productController.js';

const router = express.Router();
const uploadDir = path.join(process.cwd(), 'uploads', 'products');

if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
        const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
        cb(null, `${unique}${path.extname(file.originalname)}`);
    }
});

const upload = multer({ storage });

router.get('/', getProducts);
router.post('/add', upload.array('images', 10), createProduct);
router.put('/update/:id', upload.array('images', 10), updateProduct);
router.delete('/delete/:id', deleteProduct);

export default router;
