// services/neon.js
import 'react-native-url-polyfill/auto';
import { neon } from '@neondatabase/serverless';

// Replace with your pooled Neon connection string including ?sslmode=require
const DATABASE_URL = process.env.EXPO_PUBLIC_NEON_DATABASE_URL || 'postgresql://neondb_owner:npg_SEMN1KqPzJ9B@ep-purple-glitter-an8r2gmt-pooler.c-6.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

export const sql = neon(DATABASE_URL);