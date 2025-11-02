// FILE: /dogleg/scripts/import-golf-data.js
// PURPOSE: Import golf course data from CSV files to Supabase

import { createClient } from '@supabase/supabase-js';
import Papa from 'papaparse';
import fs from 'fs';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Setup for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config();

// Initialize Supabase
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

// ============================================
// HELPER FUNCTIONS
// ============================================

// Convert par/handicap columns to array
function extractHoleData(row, prefix) {
    const data = [];
    for (let i = 1; i <= 18; i++) {
        const value = row[`${prefix}${i}`];
        data.push(value !== undefined && value !== null && value !== '' ? parseInt(value) : null);
    }
    return data;
}

// Convert lengths to array
function extractLengths(row) {
    const lengths = [];
    for (let i = 1; i <= 18; i++) {
        const value = row[`Length${i}`];
        lengths.push(value !== undefined && value !== null && value !== '' ? parseInt(value) : null);
    }
    return lengths;
}

// Calculate total from array
function calculateTotal(arr) {
    if (!arr) return null;
    return arr.reduce((sum, val) => sum + (val || 0), 0);
}

// ============================================
// IMPORT CLUBS
// ============================================

async function importClubs(filePath) {
    console.log('\n⛳ Importing clubs...');
    
    if (!fs.existsSync(filePath)) {
        console.log('❌ clubs.csv not found at:', filePath);
        return false;
    }
    
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const { data: csvData } = Papa.parse(fileContent, { 
        header: true,
        skipEmptyLines: true,
        dynamicTyping: true
    });
    
    console.log(`📊 Found ${csvData.length} clubs to import`);
    
    const BATCH_SIZE = 500;
    let totalProcessed = 0;
    let successCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < csvData.length; i += BATCH_SIZE) {
        const batch = csvData.slice(i, i + BATCH_SIZE);
        
        const clubsToUpsert = batch.map(row => ({
            club_id: String(row.ClubID).trim(),
            club_name: row.ClubName || 'Unknown Club',
            address: row.Address,
            city: row.City,
            postal_code: row.PostalCode,
            state: row.State,
            country: row.Country,
            latitude: row.Latitude || null,
            longitude: row.Longitude || null,
            website: row.Website,
            email: row.Email,
            telephone: row.Telephone,
            continent: row.Continent
        }));
        
        try {
            const { data, error } = await supabase
                .from('clubs')
                .upsert(clubsToUpsert, {
                    onConflict: 'club_id',
                    ignoreDuplicates: false
                })
                .select();
            
            if (error) {
                console.error(`❌ Batch ${i}-${i + batch.length} error:`, error.message);
                errorCount += batch.length;
            } else {
                successCount += data.length;
            }
            
            totalProcessed += batch.length;
            
            // Progress indicator
            if (totalProcessed % 2000 === 0 || totalProcessed === csvData.length) {
                const percent = Math.round((totalProcessed / csvData.length) * 100);
                console.log(`   Progress: ${totalProcessed}/${csvData.length} (${percent}%)`);
            }
            
            // Small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 50));
            
        } catch (err) {
            console.error(`❌ Failed batch ${i}-${i + batch.length}:`, err.message);
            errorCount += batch.length;
        }
    }
    
    console.log(`✅ Clubs complete: ${successCount} successful, ${errorCount} errors`);
    return true;
}

// ============================================
// IMPORT COURSES
// ============================================

async function importCourses(filePath) {
    console.log('\n🏌️ Importing courses...');
    
    if (!fs.existsSync(filePath)) {
        console.log('❌ courses.csv not found at:', filePath);
        return false;
    }
    
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const { data: csvData } = Papa.parse(fileContent, { 
        header: true,
        skipEmptyLines: true,
        dynamicTyping: true
    });
    
    console.log(`📊 Found ${csvData.length} courses to import`);
    
    const BATCH_SIZE = 500;
    let totalProcessed = 0;
    let successCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < csvData.length; i += BATCH_SIZE) {
        const batch = csvData.slice(i, i + BATCH_SIZE);
        
        const coursesToUpsert = batch
            .filter(row => row.CourseID) // Skip rows without CourseID
            .map(row => {
                const pars = extractHoleData(row, 'Par');
                const handicaps = extractHoleData(row, 'Hcp');
                const parsWomen = extractHoleData(row, 'ParW');
                const handicapsWomen = extractHoleData(row, 'HcpW');
                
                return {
                    course_id: String(row.CourseID).trim(),
                    club_id: String(row.ClubID).trim(),
                    long_course_id: row.LongCourseID ? String(row.LongCourseID).trim() : null,
                    course_name: row.CourseName || 'Unknown Course',
                    num_holes: row.NumHoles || 18,
                    measure_meters: row.MeasureMeters === 1,
                    pars: pars,
                    handicaps: handicaps,
                    pars_women: parsWomen,
                    handicaps_women: handicapsWomen,
                    match_indices: extractHoleData(row, 'MatchIndex'),
                    split_indices: extractHoleData(row, 'SplitIndex'),
                    total_par: calculateTotal(pars),
                    timestamp_updated: row.TimestampUpdated
                };
            });
        
        if (coursesToUpsert.length === 0) continue;
        
        try {
            const { data, error } = await supabase
                .from('courses')
                .upsert(coursesToUpsert, {
                    onConflict: 'course_id',
                    ignoreDuplicates: false
                })
                .select();
            
            if (error) {
                console.error(`❌ Batch ${i}-${i + batch.length} error:`, error.message);
                errorCount += batch.length;
            } else {
                successCount += data.length;
            }
            
            totalProcessed += batch.length;
            
            // Progress indicator
            if (totalProcessed % 2000 === 0 || totalProcessed === csvData.length) {
                const percent = Math.round((totalProcessed / csvData.length) * 100);
                console.log(`   Progress: ${totalProcessed}/${csvData.length} (${percent}%)`);
            }
            
            await new Promise(resolve => setTimeout(resolve, 50));
            
        } catch (err) {
            console.error(`❌ Failed batch ${i}-${i + batch.length}:`, err.message);
            errorCount += batch.length;
        }
    }
    
    console.log(`✅ Courses complete: ${successCount} successful, ${errorCount} errors`);
    return true;
}

// ============================================
// IMPORT TEES
// ============================================

async function importTees(filePath) {
    console.log('\n🏌️‍♂️ Importing tees...');
    
    if (!fs.existsSync(filePath)) {
        console.log('❌ tees.csv not found at:', filePath);
        return false;
    }
    
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const { data: csvData } = Papa.parse(fileContent, { 
        header: true,
        skipEmptyLines: true,
        dynamicTyping: true
    });
    
    // ⭐ ADD THIS DEDUPLICATION CODE HERE - RIGHT AFTER PARSING
    const seen = new Set();
    const uniqueData = csvData.filter(row => {
        const id = String(row.TeeID);
        if (seen.has(id)) {
            return false;  // Skip this duplicate
        }
        seen.add(id);
        return true;  // Keep this row
    });
    
    console.log(`📊 Found ${csvData.length} total tees`);
    console.log(`📊 Found ${uniqueData.length} unique tees (removed ${csvData.length - uniqueData.length} duplicates)`);
    
    const BATCH_SIZE = 1000;
    let totalProcessed = 0;
    let successCount = 0;
    let errorCount = 0;
    
    // ⭐ CHANGE THIS LINE - Use uniqueData instead of csvData
    for (let i = 0; i < uniqueData.length; i += BATCH_SIZE) {
        const batch = uniqueData.slice(i, i + BATCH_SIZE);  // ⭐ CHANGED from csvData to uniqueData
        
        const teesToUpsert = batch
            .filter(row => row.CourseID && row.TeeID)
            .map(row => {
                const holeLengths = extractLengths(row);
                
                return {
                    tee_id: String(row.TeeID).trim(),  // Make sure it's a string
                    course_id: String(row.CourseID).trim(),  // Make sure it's a string
                    tee_name: row.TeeName || 'Unknown',
                    tee_color: row.TeeColor || 'White',
                    slope: row.Slope || null,
                    slope_front9: row.SlopeFront9 || null,
                    slope_back9: row.SlopeBack9 || null,
                    course_rating: row.CR || null,
                    cr_front9: row.CRFront9 || null,
                    cr_back9: row.CRBack9 || null,
                    slope_women: row.SlopeWomen || null,
                    slope_women_front9: row.SlopeWomenFront9 || null,
                    slope_women_back9: row.SlopeWomenBack || null,
                    cr_women: row.CRWomen || null,
                    cr_women_front9: row.CRWomenFront9 || null,
                    cr_women_back9: row.CRWomenBack9 || null,
                    measure_unit: row.MeasureUnit || 'yards',
                    hole_lengths: holeLengths,
                    total_length: calculateTotal(holeLengths)
                };
            });
        
        if (teesToUpsert.length === 0) continue;
        
        try {
            const { data, error } = await supabase
                .from('tees')
                .upsert(teesToUpsert, {
                    onConflict: 'tee_id',
                    ignoreDuplicates: false
                })
                .select();
            
            if (error) {
                console.error(`❌ Batch ${i}-${i + batch.length} error:`, error.message);
                errorCount += batch.length;
            } else {
                successCount += data.length;
            }
            
            totalProcessed += batch.length;
            
            // ⭐ UPDATE PROGRESS TO USE uniqueData.length
            if (totalProcessed % 5000 === 0 || totalProcessed === uniqueData.length) {
                const percent = Math.round((totalProcessed / uniqueData.length) * 100);
                console.log(`   Progress: ${totalProcessed}/${uniqueData.length} (${percent}%)`);
            }
            
            await new Promise(resolve => setTimeout(resolve, 30));
            
        } catch (err) {
            console.error(`❌ Failed batch ${i}-${i + batch.length}:`, err.message);
            errorCount += batch.length;
        }
    }
    
    console.log(`✅ Tees complete: ${successCount} successful, ${errorCount} errors`);
    return true;
}

// ============================================
// MAIN IMPORT PROCESS
// ============================================

async function main() {
    console.log('\n🏌️ ========================================');
    console.log('   DOGLEG GOLF DATA IMPORT');
    console.log('   ========================================\n');
    
    const startTime = Date.now();
    
    // Check Supabase connection
    console.log('🔌 Checking Supabase connection...');
    try {
        const { count, error } = await supabase
            .from('clubs')
            .select('*', { count: 'exact', head: true });
        
        if (error) {
            console.error('❌ Cannot connect to Supabase:', error.message);
            console.log('\nPlease check your .env file has correct keys.');
            process.exit(1);
        }
        
        console.log('✅ Connected to Supabase');
        if (count > 0) {
            console.log(`⚠️  Warning: clubs table already has ${count} records`);
            console.log('   New data will update existing records\n');
        }
        
    } catch (err) {
        console.error('❌ Connection failed:', err.message);
        process.exit(1);
    }
    
    // Define file paths
    const dataPath = path.join(__dirname, '..', 'data');
    const clubsPath = path.join(dataPath, 'clubs.csv');
    const coursesPath = path.join(dataPath, 'courses.csv');
    const teesPath = path.join(dataPath, 'tees.csv');
    
    console.log('📁 Looking for CSV files in:', dataPath);
    
    // Import in order: clubs -> courses -> tees
    let success = true;
    
    if (fs.existsSync(clubsPath)) {
        success = await importClubs(clubsPath) && success;
    } else {
        console.log('⚠️  clubs.csv not found - skipping');
    }
    
    if (fs.existsSync(coursesPath)) {
        success = await importCourses(coursesPath) && success;
    } else {
        console.log('⚠️  courses.csv not found - skipping');
    }
    
    if (fs.existsSync(teesPath)) {
        success = await importTees(teesPath) && success;
    } else {
        console.log('⚠️  tees.csv not found - skipping');
    }
    
    // Final summary
    console.log('\n========================================');
    
    // Get final counts
    const { count: clubCount } = await supabase
        .from('clubs')
        .select('*', { count: 'exact', head: true });
    const { count: courseCount } = await supabase
        .from('courses')
        .select('*', { count: 'exact', head: true });
    const { count: teeCount } = await supabase
        .from('tees')
        .select('*', { count: 'exact', head: true });
    
    console.log('📊 DATABASE TOTALS:');
    console.log(`   Clubs:   ${clubCount || 0}`);
    console.log(`   Courses: ${courseCount || 0}`);
    console.log(`   Tees:    ${teeCount || 0}`);
    
    const duration = Math.round((Date.now() - startTime) / 1000);
    console.log(`\n⏱️  Total time: ${duration} seconds`);
    
    if (success) {
        console.log('\n✅ Import completed successfully!');
    } else {
        console.log('\n⚠️  Import completed with some errors');
    }
}

// Run if called directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    main().catch(console.error);
}

export { importClubs, importCourses, importTees };