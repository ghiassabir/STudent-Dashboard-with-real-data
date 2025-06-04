// --- Constants for Data Files ---
const AGGREGATED_SCORES_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSySYBO9YL3N4aUG3JEYZMQQIv9d1oSm3ba4Ty9Gt4SsGs2zmTS_k81rH3Qv41mZvClnayNcDpl_QbI/pub?gid=1890969747&single=true&output=csv';
const QUESTION_DETAILS_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSySYBO9YL3N4aUG3JEYZMQQIv9d1oSm3ba4Ty9Gt4SsGs2zmTS_k81rH3Qv41mZvClnayNcDpl_QbI/pub?gid=822014112&single=true&output=csv';

let currentStudentData = {};
let allAggregatedData = [];
let allQuestionDetailsData = [];

// Predefined EOC Chapters - !!! USER MUST UPDATE THESE TO MATCH THEIR CURRICULUM !!!
// These names should match the result of cleanAssessmentName(feedAssessmentName)
const eocChapters = {
    reading: ["Vocabulary in Context", "Making the Leap", "The Big Picture", "Literal Comprehension", "Reading for Function", "Supporting & Undermining", "Graphs & Charts", "Paired Passages"],
    writing: ["Transitions", "Specific Focus", "Sentences & Fragments", "Joining & Separating Sentences", "Non-Essential & Essential Clauses", "Verbs Agreements and Tense", "Pronouns", "Modification", "Parallel Structure"],
    math: ["Exponents & Radicals", "Percent", "Rates", "Ratio & Proportion", "Expressions", "Constructing Models", "Manipulating & Solving Equations", "Systems of Equations", "Inequalities", "Lines", "Functions", "Quadratics", "Angles", "Triangles", "Circles", "Trigonometry", "Probability", "Statistics 1"]
};

// Predefined Standard CB Test Names - !!! USER CAN UPDATE THESE !!!
const standardCbTestNames = [
    "Diagnostic Test", // Expects DG-T0 in feed
    "CB Practice Test 4",  // Expects CB-T4 in feed
    "CB Practice Test 5",
    "CB Practice Test 6",
    "CB Practice Test 7",
    "CB Practice Test 8",
    "CB Practice Test 9",
    "CB Practice Test 10"
];

// Mapping from AssessmentName in FEED to standard display names for CB Tests
// !!! USER MUST UPDATE THIS MAPPING BASED ON THEIR FEED DATA !!!
const feedNameToStandardTestName = {
    "DG-T0": "Diagnostic Test",
    "CB-T4": "CB Practice Test 4",
    "CB-T5": "CB Practice Test 5", // Example, add if you have T5, T6 etc.
    "CB-T6": "CB Practice Test 6",
    // Add mappings for T7-T10 if they exist in your feed with similar patterns
};

// Mapping from AGGREGATE CB Test AssessmentName (from feed) to its constituent MODULE AssessmentNames (from feed)
// !!! USER MUST UPDATE THIS MAPPING BASED ON THEIR FEED DATA !!!
const aggregateTestToModulesMap = {
    "CB-T4": ["CB-T4-E1", "CB-T4-E2", "CB-T4-M1", "CB-T4-M2"],
    "DG-T0": ["DG-T0-E1", "DG-T0-E2", "DG-T0-M1", "DG-T0-M2"], // Example for diagnostic
    // Add other aggregate tests if applicable
};


// --- Date Formatting Helper ---
function formatDate(dateString) {
    if (!dateString || dateString === "N/A" || dateString === "Not Attempted" || String(dateString).toLowerCase().includes("invalid date")) return "N/A";
    try {
        let cleanedDateString = String(dateString); // Ensure it's a string
        if (cleanedDateString.includes(" GMT")) {
            cleanedDateString = cleanedDateString.substring(0, cleanedDateString.indexOf(" GMT"));
        }
        const date = new Date(cleanedDateString);
        if (isNaN(date.getTime())) {
             const parts = cleanedDateString.split(/[-/T\s:]/);
             if (parts.length >=3) {
                 const year = parseInt(parts[0]);
                 const month = parseInt(parts[1]) -1;
                 const day = parseInt(parts[2]);
                 // Use Date.UTC to avoid local timezone interpretation issues when only date is relevant
                 const composedDate = new Date(Date.UTC(year, month, day));
                 if (!isNaN(composedDate.getTime())) {
                     return `${composedDate.getUTCDate()} ${composedDate.toLocaleString('default', { month: 'short', timeZone: 'UTC' })}, ${composedDate.getUTCFullYear()}`;
                 }
             }
            console.warn("Could not format date (attempt 1 failed for):", dateString);
            return String(dateString).split(" ")[0] || "N/A"; // Return original date part or N/A
        }
        const day = date.getUTCDate(); // Use UTC to be consistent
        const month = date.toLocaleString('default', { month: 'short', timeZone: 'UTC' });
        const year = date.getUTCFullYear();
        return `${day} ${month}, ${year}`;
    } catch (e) {
        console.warn("Error formatting date:", dateString, e);
        return String(dateString).split(" ")[0] || "N/A";
    }
}

document.addEventListener('DOMContentLoaded', function () {
    let loggedInStudentGmailID = localStorage.getItem('loggedInStudentGmailID');
    if (!loggedInStudentGmailID) {
        loggedInStudentGmailID = prompt("Enter your Student Gmail ID for testing (e.g., ali.khan@example.pk):");
        if (loggedInStudentGmailID) {
            localStorage.setItem('loggedInStudentGmailID', loggedInStudentGmailID);
        } else {
            document.body.innerHTML = "<p>Student Gmail ID is required to view the dashboard. Please refresh and enter an ID.</p>";
            return;
        }
    }
    loadAndProcessData(loggedInStudentGmailID);
    setupEventListeners();
});

function setupEventListeners() {
    const mainTabs = document.querySelectorAll('.main-tab-button');
    const mainTabContents = document.querySelectorAll('.main-tab-content');
    const hamburgerButton = document.getElementById('hamburgerButton');
    const mobileMenu = document.getElementById('mobileMenu');
    const mobileNavLinks = document.querySelectorAll('.mobile-nav-link');

    document.getElementById('currentYear').textContent = new Date().getFullYear();

    if (hamburgerButton && mobileMenu) {
        hamburgerButton.addEventListener('click', () => {
            mobileMenu.classList.toggle('hidden');
        });
    }

    window.switchMainTab = function(tabElementOrName) {
        let targetTabName;
        if(typeof tabElementOrName === 'string') {
            targetTabName = tabElementOrName;
        } else {
            targetTabName = tabElementOrName.getAttribute('data-main-tab');
        }

        mainTabs.forEach(t => t.classList.remove('active'));
        mainTabContents.forEach(content => content.classList.add('hidden'));
        mobileNavLinks.forEach(link => link.classList.remove('active'));

        const desktopTabToActivate = document.querySelector(`.main-tab-button[data-main-tab="${targetTabName}"]`);
        if (desktopTabToActivate) desktopTabToActivate.classList.add('active');
        
        const mobileLinkToActivate = document.querySelector(`.mobile-nav-link[data-main-tab="${targetTabName}"]`);
        if (mobileLinkToActivate) mobileLinkToActivate.classList.add('active');

        const targetContentId = targetTabName + '-content';
        const targetElement = document.getElementById(targetContentId);
        if (targetElement) {
            targetElement.classList.remove('hidden');
        }
        if (targetContentId === 'overview-content' && currentStudentData.isDataAvailable) {
            initializeOverviewCharts(currentStudentData); 
        }
        
        if (targetElement && !targetElement.dataset.subTabsInitialized) {
            const firstSubTab = targetElement.querySelector('.sub-tab-button');
            if (firstSubTab) {
                firstSubTab.click();
            }
            targetElement.dataset.subTabsInitialized = true; 
        }

        if (mobileMenu && !mobileMenu.classList.contains('hidden')) {
            mobileMenu.classList.add('hidden');
        }
    }

    mainTabs.forEach(tab => {
        tab.addEventListener('click', () => switchMainTab(tab));
    });

    mobileNavLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault(); 
            switchMainTab(link);
        });
    });

    document.querySelectorAll('.sub-tab-button').forEach(subTab => {
        subTab.addEventListener('click', () => {
            const parentMainTabContent = subTab.closest('.main-tab-content');
            parentMainTabContent.querySelectorAll('.sub-tab-button').forEach(st => st.classList.remove('active'));
            parentMainTabContent.querySelectorAll('.sub-tab-content-panel').forEach(panel => panel.classList.add('hidden'));
            subTab.classList.add('active');
            const targetSubContentId = subTab.getAttribute('data-sub-tab') + '-content';
            document.getElementById(targetSubContentId)?.classList.remove('hidden');
        });
    });
}

async function loadAndProcessData(loggedInStudentGmailID) {
    if (!loggedInStudentGmailID) {
        console.error("No logged-in student Gmail ID provided.");
        document.getElementById('studentNameDisplay').textContent = `Welcome! Please log in.`;
        return;
    }
    console.log("Fetching data for student:", loggedInStudentGmailID);
    document.getElementById('studentNameDisplay').textContent = `Loading data for ${loggedInStudentGmailID}...`;

    try {
        const [aggregatedResponse, questionsResponse] = await Promise.all([
            fetch(AGGREGATED_SCORES_CSV_URL),
            fetch(QUESTION_DETAILS_CSV_URL)
        ]);

        if (!aggregatedResponse.ok || !questionsResponse.ok) {
            let errorMsg = "Error loading data: ";
            if (!aggregatedResponse.ok) errorMsg += `Aggregated Scores CSV (${aggregatedResponse.status} ${aggregatedResponse.statusText}). `;
            if (!questionsResponse.ok) errorMsg += `Question Details CSV (${questionsResponse.status} ${questionsResponse.statusText}).`;
            console.error(errorMsg);
            alert(errorMsg + " Please check the console and ensure the CSV URLs are correct and publicly accessible.");
            document.getElementById('studentNameDisplay').textContent = `Failed to load data.`;
            return;
        }
        
        const aggregatedCsvText = await aggregatedResponse.text();
        const questionsCsvText = await questionsResponse.text();

        const aggregatedResult = Papa.parse(aggregatedCsvText, { header: true, skipEmptyLines: true, dynamicTyping: true });
        const questionsResult = Papa.parse(questionsCsvText, { header: true, skipEmptyLines: true, dynamicTyping: true });
        
        allAggregatedData = aggregatedResult.data;
        allQuestionDetailsData = questionsResult.data;

        console.log("Aggregated Data Raw (first 5 for all students):", allAggregatedData.slice(0,5));
        console.log("Question Details Raw (first 5 for all students):", allQuestionDetailsData.slice(0,5));

        currentStudentData = transformDataForDashboard(allAggregatedData, allQuestionDetailsData, loggedInStudentGmailID);
        
        if (currentStudentData && currentStudentData.isDataAvailable) {
            displayData(currentStudentData);
            if (typeof switchMainTab === 'function') {
                switchMainTab("overview");
            } else {
                document.querySelector('.main-tab-button[data-main-tab="overview"]')?.click();
            }
        } else {
            console.error("No data found or processed for student:", loggedInStudentGmailID);
            alert(`No performance data found for student Gmail ID: ${loggedInStudentGmailID}. Please check the ID or the data source.`);
            const studentNameToDisplay = (currentStudentData && currentStudentData.name && currentStudentData.name !== loggedInStudentGmailID) ? currentStudentData.name : loggedInStudentGmailID;
            document.getElementById('studentNameDisplay').textContent = `Welcome, ${studentNameToDisplay} (No performance data found)`;
        }

    } catch (error) {
        console.error("Error loading or parsing CSV data:", error);
        alert("A critical error occurred while loading dashboard data. Please check the console for details.");
        document.getElementById('studentNameDisplay').textContent = `Error loading data.`;
    }
}

function cleanAssessmentName(assessmentName) {
    if (typeof assessmentName !== 'string') return "Unknown Assessment";
    // Remove prefixes like R-EOC-C#- or M-EOC-C#- etc. and leading/trailing hyphens/spaces
    let cleaned = assessmentName.replace(/^[RWM]-EOC-C\d+-/i, ''); // Case-insensitive prefix removal
    cleaned = cleaned.replace(/^-+|-+$/g, '').trim(); // Remove leading/trailing hyphens and trim
    return cleaned || assessmentName; // Return original if cleaning results in empty string
}


function transformDataForDashboard(aggregatedDataArray, questionDetailsArray, loggedInStudentGmailID) {
    const studentAggregated = aggregatedDataArray.filter(row => row.StudentGmailID === loggedInStudentGmailID);
    const studentQuestions = questionDetailsArray.filter(row => row.StudentGmailID === loggedInStudentGmailID);

    let studentDisplayName = loggedInStudentGmailID; 
    // Student_Mapping sheet should be the source of truth for names.
    // If Apps Script added StudentName_Canvas/Full to aggregated feed, we could use it.
    // For now, this needs to be improved if a display name other than GmailID is required without a separate mapping fetch.
    // We'll assume studentAggregated might have a name if Apps Script was modified to include it.
     if (studentAggregated.length > 0 && studentAggregated[0].StudentName_Full) { 
        studentDisplayName = studentAggregated[0].StudentName_Full;
    } else if (studentAggregated.length > 0 && studentAggregated[0].StudentName_Canvas) { 
        studentDisplayName = studentAggregated[0].StudentName_Canvas;
    }


    if (studentAggregated.length === 0 && studentQuestions.length === 0) { // Check both, as student might have questions but no aggregated scores yet or vice-versa
        console.warn("No aggregated or question data found for student:", loggedInStudentGmailID);
        return { 
            name: studentDisplayName, 
            isDataAvailable: false 
        }; 
    }

    let transformed = {
        name: studentDisplayName,
        targetScore: "N/A", // Placeholder - this should come from Student_Mapping
        latestScores: { total: "N/A", rw: "N/A", math: "N/A", avgEocPractice: "N/A" },
        classAveragesGlobal: { total: "N/A", rw: "N/A", math: "N/A", avgEocPractice: "N/A" },
        scoreTrend: { labels: [], studentScores: [], classAvgScores: [] },
        overallSkillPerformance: { labels: ['Reading', 'Writing & Language', 'Math'], studentAccuracy: [0, 0, 0], classAvgAccuracy: [0, 0, 0] },
        strengths: [],
        improvements: [],
        cbPracticeTests: [],
        eocQuizzes: { reading: [], writing: [], math: [] }, // Will be populated with full chapter lists
        khanAcademy: { reading: [], writing: [], math: [] },
        cbSkills: { reading: [], writing: [], math: [] },
        questionDetails: studentQuestions,
        isDataAvailable: true
    };
    
    // Populate Latest Scores & Class Averages (Overview)
    const studentCbTestAggregates = studentAggregated.filter(r => r.AssessmentSource === 'Canvas CB Test');
    studentCbTestAggregates.sort((a,b) => { /* existing robust date sort */
        const dateA = new Date(a.AttemptDate === "N/A" || !a.AttemptDate ? 0 : a.AttemptDate);
        const dateB = new Date(b.AttemptDate === "N/A" || !b.AttemptDate ? 0 : b.AttemptDate);
        const validA = !isNaN(dateA.getTime()) && a.AttemptDate !== "N/A" && a.AttemptDate;
        const validB = !isNaN(dateB.getTime()) && b.AttemptDate !== "N/A" && b.AttemptDate;
        if (validA && validB) return dateB - dateA;
        if (validA) return -1; if (validB) return 1;
        return 0;
    });

    if (studentCbTestAggregates.length > 0) {
        const latestTest = studentCbTestAggregates[0];
        transformed.latestScores.total = latestTest.ScaledScore_Total || "N/A";
        transformed.latestScores.rw = latestTest.ScaledScore_RW || "N/A";
        transformed.latestScores.math = latestTest.ScaledScore_Math || "N/A";
        transformed.classAveragesGlobal.total = latestTest.ClassAverageScore_Normalized || "N/A";
        transformed.classAveragesGlobal.rw = "N/A"; // Feed doesn't have specific class avg scaled R/W
        transformed.classAveragesGlobal.math = "N/A"; // Feed doesn't have specific class avg scaled Math
    }

    const studentEocEntries = studentAggregated.filter(r => r.AssessmentSource === 'Canvas EOC Practice' && r.Score_Percentage);
    const studentEocPercentages = studentEocEntries.map(r => parseFloat(String(r.Score_Percentage).replace('%', ''))).filter(p => !isNaN(p));
    if (studentEocPercentages.length > 0) {
        transformed.latestScores.avgEocPractice = (studentEocPercentages.reduce((a,b) => a + b, 0) / studentEocPercentages.length).toFixed(0) + '%';
    }
    
    const allEocClassAvgsPercentages = allAggregatedData // Use allAggregatedData for broader class average
        .filter(r => r.AssessmentSource === 'Canvas EOC Practice' && r.ClassAverageScore_Normalized && String(r.ClassAverageScore_Normalized).includes('%'))
        .map(r => parseFloat(String(r.ClassAverageScore_Normalized).replace('%', '')))
        .filter(p => !isNaN(p));
    if (allEocClassAvgsPercentages.length > 0) {
        transformed.classAveragesGlobal.avgEocPractice = (allEocClassAvgsPercentages.reduce((a,b) => a+b, 0) / allEocClassAvgsPercentages.length).toFixed(0) + '%';
    }

    // Populate Score Trend (using student's CB Test Aggregates)
    studentCbTestAggregates.slice().reverse().forEach(test => { 
        transformed.scoreTrend.labels.push(test.AssessmentName);
        transformed.scoreTrend.studentScores.push(parseFloat(test.ScaledScore_Total) || null);
        const classAvgNorm = parseFloat(String(test.ClassAverageScore_Normalized).replace('%',''));
        transformed.scoreTrend.classAvgScores.push( !isNaN(classAvgNorm) ? (classAvgNorm / 100 * 1600) : null );
    });

    // Populate Overall Skill Performance & Strengths/Improvements (Basic - relies on good skill tags)
    const skillToCategory = (skillTag) => { /* ... same as before ... */ 
        if (!skillTag || typeof skillTag !== 'string') return 'Unknown';
        const tag = skillTag.toLowerCase().trim();
        if (tag === 'tbd' || tag.startsWith('tbd_')) return 'Unknown'; 
        if (tag.includes('read') || tag.includes('vocab') || tag.includes('evidence') || tag.includes('info') || tag.includes('idea') || tag.includes('inference') || tag.includes('purpose') || tag.includes('rhetoric')) return 'Reading';
        if (tag.includes('writ') || tag.includes('lang') || tag.includes('gramm') || tag.includes('expression') || tag.includes('convention') || tag.includes('sentence structure') || tag.includes('punctuation')) return 'Writing & Language';
        if (tag.includes('math') || tag.includes('alg') || tag.includes('geom') || tag.includes('data an') || tag.includes('adv math') || tag.includes('problem solv') || tag.includes('equation') || tag.includes('function')) return 'Math';
        return 'Unknown';
    };

    const studentSkillPerformance = { Reading: { correct: 0, total: 0 }, 'Writing & Language': { correct: 0, total: 0 }, Math: { correct: 0, total: 0 }, Unknown: {correct: 0, total: 0} };
    const classSkillPerformanceCalc = { Reading: { totalWeightedAvg: 0, totalWeights: 0}, 'Writing & Language': { totalWeightedAvg: 0, totalWeights: 0 }, Math: { totalWeightedAvg: 0, totalWeights: 0 }, Unknown: {totalWeightedAvg: 0, totalWeights: 0}};
    const granularSkills = {}; 

    studentQuestions.forEach(q => {
        const category = skillToCategory(q.SAT_Skill_Tag);
        const pointsPossible = parseFloat(q.PointsPossible_Question) || 1;
        const pointsEarned = parseFloat(q.PointsEarned) || 0;
        const classAvgPoints = parseFloat(q.ClassAveragePoints_Question);

        studentSkillPerformance[category].correct += pointsEarned;
        studentSkillPerformance[category].total += pointsPossible;

        if (!isNaN(classAvgPoints) && pointsPossible > 0) {
             const classPerfOnQuestion = (classAvgPoints / pointsPossible); // Fraction 0-1
             classSkillPerformanceCalc[category].totalWeightedAvg += classPerfOnQuestion * pointsPossible; // Weight by points possible
             classSkillPerformanceCalc[category].totalWeights += pointsPossible;
        }
        
        const skillTag = q.SAT_Skill_Tag;
        if (skillTag && !String(skillTag).toUpperCase().startsWith('TBD') && String(skillTag).trim() !== '') {
            if (!granularSkills[skillTag]) {
                granularSkills[skillTag] = { studentCorrect: 0, studentTotal: 0, classAvgPointsSum: 0, classPointsPossibleSum: 0, questions: 0 };
            }
            granularSkills[skillTag].studentCorrect += pointsEarned;
            granularSkills[skillTag].studentTotal += pointsPossible;
            if (!isNaN(classAvgPoints)) {
                 granularSkills[skillTag].classAvgPointsSum += classAvgPoints;
                 granularSkills[skillTag].classPointsPossibleSum += pointsPossible;
                 granularSkills[skillTag].questions++;
            }
        }
    });

    transformed.overallSkillPerformance.studentAccuracy = Object.values(studentSkillPerformance).map(subj => {
        return subj.total > 0 ? parseFloat((subj.correct / subj.total * 100).toFixed(0)) : 0;
    }).slice(0,3); // Only take Reading, W&L, Math
    
    transformed.overallSkillPerformance.classAvgAccuracy = Object.values(classSkillPerformanceCalc).map(subj => {
        return subj.totalWeights > 0 ? parseFloat((subj.totalWeightedAvg / subj.totalWeights * 100).toFixed(0)) : 0;
    }).slice(0,3);


    const skillDetailsArray = [];
    for (const skillName in granularSkills) {
        const data = granularSkills[skillName];
        const studentAccuracy = data.studentTotal > 0 ? (data.studentCorrect / data.studentTotal * 100) : 0;
        const classAccuracy = data.classPointsPossibleSum > 0 ? (data.classAvgPointsSum / data.classPointsPossibleSum * 100) : 0;
        skillDetailsArray.push({ name: skillName, studentAccuracy, classAccuracy, diff: studentAccuracy - classAccuracy });
    }
    skillDetailsArray.sort((a,b) => b.diff - a.diff); 
    transformed.strengths = skillDetailsArray.filter(s => s.diff > 5 && s.studentAccuracy > 60).slice(0, 5).map(s => `${s.name} (${s.studentAccuracy.toFixed(0)}%)`);
    skillDetailsArray.sort((a,b) => a.diff - b.diff); 
    transformed.improvements = skillDetailsArray.filter(s => s.diff < -5 && s.studentAccuracy < 70).slice(0, 5).map(s => `${s.name} (${s.studentAccuracy.toFixed(0)}%)`);

    // --- Populate CB Practice Tests Table (Structured by predefined list) ---
    transformed.cbPracticeTests = standardCbTestNames.map(standardName => {
        // Find the corresponding feed name for this standard display name
        let feedNameForThisStandardTest = null;
        for (const key in feedNameToStandardTestName) {
            if (feedNameToStandardTestName[key] === standardName) {
                feedNameForThisStandardTest = key;
                break;
            }
        }
        
        const testAttempt = studentAggregated.find(row => 
            row.AssessmentSource === 'Canvas CB Test' && 
            row.AssessmentName === feedNameForThisStandardTest
        );

        if (testAttempt) {
            return {
                name: standardName, // Use the standard display name
                date: formatDate(testAttempt.AttemptDate),
                rw: testAttempt.ScaledScore_RW || '-',
                math: testAttempt.ScaledScore_Math || '-',
                total: testAttempt.ScaledScore_Total || '-',
                classAvgRW: "N/A", 
                classAvgMath: "N/A", 
                classAvgTotal: testAttempt.ClassAverageScore_Normalized || '-'
            };
        } else {
            return { name: standardName, date: "N/A", rw: '-', math: '-', total: '-', classAvgRW: 'N/A', classAvgMath: 'N/A', classAvgTotal: 'N/A' };
        }
    });
    
    // Populate EOC with all chapters, marking N/A for unattempted
    Object.keys(eocChapters).forEach(subject => {
        transformed.eocQuizzes[subject] = eocChapters[subject].map(chapterNameFromList => {
            // Find if the student has an attempt for this cleaned chapter name
            const attempt = studentAggregated.find(row => {
                if (row.AssessmentSource !== 'Canvas EOC Practice') return false;
                const cleanedFeedName = cleanAssessmentName(row.AssessmentName);
                // Debugging log for EOC matching:
                // if (subject === 'reading' && chapterNameFromList.includes("Vocab")) { // Example condition
                //    console.log(`EOC Match Attempt: List='${chapterNameFromList}', FeedRaw='${row.AssessmentName}', FeedCleaned='${cleanedFeedName}'`);
                // }
                return cleanedFeedName.toLowerCase() === chapterNameFromList.toLowerCase() &&
                       (inferSubject(row.AssessmentName) === subject || !inferSubject(row.AssessmentName));
            });
            
            if (attempt) {
                return {
                    name: chapterNameFromList, // Display the clean name from our list
                    originalName: attempt.AssessmentName, // Store original name if needed for modal filtering
                    latestScore: `${attempt.Score_Percentage || 'N/A'} (${attempt.Score_Raw_Combined || 'N/A'}/${attempt.PointsPossible_Combined || 'N/A'})`,
                    classAvg: attempt.ClassAverageScore_Normalized || "N/A",
                    date: formatDate(attempt.AttemptDate)
                };
            } else {
                return { name: chapterNameFromList, originalName: null, latestScore: "N/A", classAvg: "N/A", date: "N/A" };
            }
        });
    });

    // Populate Khan Academy
    studentAggregated.forEach(row => {
        const subject = inferSubject(row.AssessmentName); // Reuse inferSubject
        if (row.AssessmentSource === 'Khan Academy Practice' && subject && transformed.khanAcademy[subject]) {
            transformed.khanAcademy[subject].push({
                name: row.AssessmentName, // Khan names are usually fine as is
                date: formatDate(row.AttemptDate),
                score: `${row.Score_Raw_Combined || 'N/A'}/${row.PointsPossible_Combined || 'N/A'} (${row.Score_Percentage || 'N/A'})`,
                pointsPossible: row.PointsPossible_Combined || "N/A",
                classAvg: row.ClassAverageScore_Normalized || "N/A" // Or specific Khan class avg if feed provides
            });
        }
    });
    
    // Populate CB Skills (from granularSkills derived from questionDetails)
    for (const skillName in granularSkills) {
        const data = granularSkills[skillName];
        const category = skillToCategory(skillName); // Use the same mapping
        if (category !== 'Unknown' && transformed.cbSkills[category]) {
             transformed.cbSkills[category].push({
                name: skillName,
                score: parseFloat(data.studentTotal > 0 ? (data.studentCorrect / data.studentTotal * 100).toFixed(0) : 0),
                classAvg: parseFloat(data.questions > 0 ? (data.classPointsPossibleSum > 0 ? (data.classAvgPointsSum / data.classPointsPossibleSum * 100) : 0).toFixed(0) : 0)
            });
        }
    }

    console.log("Transformed currentStudentData (final):", JSON.parse(JSON.stringify(transformed)));
    return transformed;
}


function displayData(studentData) {
    if (!studentData || !studentData.isDataAvailable) {
        console.warn("No data available to display for student or student data incomplete.");
        const nameToDisplay = (studentData && studentData.name) ? studentData.name : (localStorage.getItem('loggedInStudentGmailID') || "Guest");
        document.getElementById('studentNameDisplay').textContent = `Welcome, ${nameToDisplay}! (No performance data found)`;
        
        document.getElementById('overview-content').innerHTML = "<p class='text-center p-4 text-gray-600'>No performance data currently available for this student.</p>";
        document.getElementById('cb-practice-tests-table-body').innerHTML = `<tr><td colspan="8" class="text-center text-gray-500 py-3">No CB Practice Test data available.</td></tr>`;
        ['reading', 'writing', 'math'].forEach(subject => {
            const eocTbody = document.getElementById(`${subject}-eoc-tbody`);
            if (eocTbody) eocTbody.innerHTML = `<tr><td colspan="4" class="text-center text-gray-500 py-3">No EOC data.</td></tr>`;
            
            const khanContainer = document.getElementById(`${subject}-khan-data`);
            if (khanContainer) khanContainer.innerHTML = `<p class="text-gray-500 p-3">No Khan data.</p>`;
            
            const skillsContainer = document.getElementById(`${subject}-cb-skills-data`);
            if (skillsContainer) skillsContainer.innerHTML = `<p class="text-gray-500 p-3">No Skill data.</p>`;
        });
        return;
    }

    document.getElementById('studentNameDisplay').textContent = `Welcome, ${studentData.name}!`;
    
    const overviewSnapshotDiv = document.getElementById('overview-content').querySelector('.grid.grid-cols-1'); // Target the div containing score cards
    if (overviewSnapshotDiv && overviewSnapshotDiv.children.length >= 5) {
        const cards = overviewSnapshotDiv.children;
        cards[0].querySelector('.score-value').innerHTML = `${studentData.latestScores.total || 'N/A'} <span class="text-lg text-gray-500">/ 1600</span>`;
        cards[0].querySelector('.text-sm').textContent = `Class Avg: ${studentData.classAveragesGlobal.total || 'N/A'}`;
        
        cards[1].querySelector('.score-value').innerHTML = `${studentData.latestScores.rw || 'N/A'} <span class="text-lg text-gray-500">/ 800</span>`;
        cards[1].querySelector('.text-sm').textContent = `Class Avg: ${studentData.classAveragesGlobal.rw || 'N/A'}`;
        
        cards[2].querySelector('.score-value').innerHTML = `${studentData.latestScores.math || 'N/A'} <span class="text-lg text-gray-500">/ 800</span>`;
        cards[2].querySelector('.text-sm').textContent = `Class Avg: ${studentData.classAveragesGlobal.math || 'N/A'}`;
        
        cards[3].querySelector('.score-value').textContent = studentData.latestScores.avgEocPractice || 'N/A';
        cards[3].querySelector('.text-sm').textContent = `Class Avg: ${studentData.classAveragesGlobal.avgEocPractice || 'N/A'}`;

        cards[4].querySelector('.text-3xl').textContent = studentData.targetScore || 'N/A';
        const latestTotalNum = parseFloat(studentData.latestScores.total);
        const targetNum = parseFloat(studentData.targetScore);
        if (!isNaN(latestTotalNum) && !isNaN(targetNum) && targetNum > latestTotalNum) {
            cards[4].querySelector('.text-sm').textContent = `Goal: +${targetNum - latestTotalNum} points`;
        } else if (!isNaN(targetNum)) {
             cards[4].querySelector('.text-sm').textContent = `Target is set.`;
        } else {
             cards[4].querySelector('.text-sm').textContent = `Set a target!`;
        }
    }

    populateOverviewSnapshot(studentData); 
    if(document.getElementById('overview-content').classList.contains('hidden') === false) { // Only init if overview tab is active
        initializeOverviewCharts(studentData);
    }
    populatePracticeTestsTable(studentData.cbPracticeTests);
    
    ['reading', 'writing', 'math'].forEach(subject => {
        populateEOCTable(subject, studentData.eocQuizzes[subject] || []);
        populateKhanSection(subject, studentData.khanAcademy[subject] || []);
        populateCBSkills(subject, studentData.cbSkills[subject] || []);
    });
}

// ... (keep populateOverviewSnapshot, initializeOverviewCharts, populatePracticeTestsTable, getPerformanceClass, populateCBSkills from previous version) ...
// ... (modal functions: openModal, closeModal, window.onclick) ...
// Ensure these functions are present from the previous script version. The following are repeated for completeness if needed.

let scoreTrendChartInstance = null; 
let overallSkillChartInstance = null;
let modalDonutChartInstance = null; 
let modalLineChartInstance = null; 

function populateOverviewSnapshot(studentData) { 
    const overviewStrengthsList = document.getElementById('overviewStrengthsList'); 
    const overviewImprovementsList = document.getElementById('overviewImprovementsList');
    const timeSpentOverviewDiv = document.getElementById('timeSpentOverview');
    
    if(overviewStrengthsList) {
        overviewStrengthsList.innerHTML = ''; 
        (studentData.strengths || []).forEach(item => {
            const li = document.createElement('li');
            li.textContent = item;
            overviewStrengthsList.appendChild(li);
        });
        if ((studentData.strengths || []).length === 0) overviewStrengthsList.innerHTML = '<li>No specific strengths identified yet. (Ensure skill tags are populated in data)</li>';
    }
    if(overviewImprovementsList) {
        overviewImprovementsList.innerHTML = ''; 
        (studentData.improvements || []).forEach(item => {
            const li = document.createElement('li');
            li.textContent = item;
            overviewImprovementsList.appendChild(li);
        });
         if ((studentData.improvements || []).length === 0) overviewImprovementsList.innerHTML = '<li>No specific improvement areas identified yet. (Ensure skill tags are populated in data)</li>';
    }
    if(timeSpentOverviewDiv) { // Explicitly N/A as per plan
        timeSpentOverviewDiv.innerHTML = `<p class="text-gray-600">Your Avg: <span class="font-semibold">N/A</span></p><p class="text-gray-600">Class Avg: <span class="font-semibold">N/A</span></p><p class="text-xs text-gray-400">(Overall portal usage data not currently available)</p>`;
    }
}

function initializeOverviewCharts(studentData) {
    if (!studentData.isDataAvailable) return;
    const primaryChartColor = '#2a5266'; 
    const secondaryChartColor = '#757575'; 
    const barChartPrimaryBg = 'rgba(42, 82, 102, 0.8)'; 
    const barChartSecondaryBg = 'rgba(117, 117, 117, 0.7)';
    const chartOptions = { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: true, position: 'bottom' }}};
    
    const scoreTrendCtx = document.getElementById('scoreTrendChart')?.getContext('2d');
    if (scoreTrendCtx) {
        if (scoreTrendChartInstance) scoreTrendChartInstance.destroy();
        scoreTrendChartInstance = new Chart(scoreTrendCtx, { 
            type: 'line', 
            data: { 
                labels: studentData.scoreTrend.labels, 
                datasets: [
                    { label: 'Your Total Score', data: studentData.scoreTrend.studentScores, borderColor: primaryChartColor, tension: 0.1, fill: false },
                    { label: 'Class Average Approx. Scaled', data: studentData.scoreTrend.classAvgScores, borderColor: secondaryChartColor, tension: 0.1, borderDash: [5, 5], fill: false }
                ] 
            }, 
            options: chartOptions 
        });
    }
    
    const overallSkillCtx = document.getElementById('overallSkillChart')?.getContext('2d');
    if (overallSkillCtx) {
        if (overallSkillChartInstance) overallSkillChartInstance.destroy();
        overallSkillChartInstance = new Chart(overallSkillCtx, { 
            type: 'bar', 
            data: { 
                labels: studentData.overallSkillPerformance.labels, 
                datasets: [
                    { label: 'Your Accuracy', data: studentData.overallSkillPerformance.studentAccuracy, backgroundColor: barChartPrimaryBg },
                    { label: 'Class Average Accuracy (Approx.)', data: studentData.overallSkillPerformance.classAvgAccuracy, backgroundColor: barChartSecondaryBg }
                ] 
            }, 
            options: { ...chartOptions, scales: { y: { beginAtZero: true, max: 100, ticks: { callback: function(value) { return value + "%" } } } } } 
        });
    }
}

function populatePracticeTestsTable(testsData) { // testsData is now the structured list from transformDataForDashboard
    const cbTableBody = document.getElementById('cb-practice-tests-table-body');
    if (!cbTableBody) return;
    cbTableBody.innerHTML = ''; 
    if (!testsData || testsData.length === 0) {
        cbTableBody.innerHTML = `<tr><td colspan="8" class="text-center text-gray-500 py-3">No CB Practice Test data available for this student.</td></tr>`;
        return;
    }
    testsData.forEach(test => {
        const row = cbTableBody.insertRow();
        // Only make row clickable if it's an actual attempt (e.g., date is not N/A)
        if (test.date !== "N/A") {
            row.className = 'clickable-row';
            // For the modal, we need to pass the original feed name if different from display name.
            // The feedNameToStandardTestName maps FEED_NAME -> DISPLAY_NAME. We need reverse or use feed name from source obj.
            // For simplicity, we assume test.originalFeedName might be stored if needed.
            // Or, the modal function will need to handle standard names to find module data.
            // We pass the standard name (test.name) to openModal for now.
            row.onclick = () => openModal(`${test.name} Details`, { type: 'cb_test', assessmentName: test.name, originalFeedName: test.originalFeedName || test.name });
        }
        row.innerHTML = `<td>${test.name}</td><td>${test.date}</td><td>${test.rw}</td><td>${test.math}</td><td>${test.total}</td><td>${test.classAvgRW}</td><td>${test.classAvgMath}</td><td>${test.classAvgTotal}</td>`;
    });
}

function populateEOCTable(sectionKey, eocQuizDataForSubject) {
    const tbody = document.getElementById(`${sectionKey}-eoc-tbody`);
    const thead = document.getElementById(`${sectionKey}-eoc-thead`);
    if (!tbody || !thead) { console.warn(`EOC table/head not found for ${sectionKey}`); return; }
    
    thead.innerHTML = `<tr><th>Chapter/Practice Name</th><th>Your Score</th><th>Date Attempted</th><th>Class Avg Score</th></tr>`;
    tbody.innerHTML = ''; 

    if (!eocQuizDataForSubject || eocQuizDataForSubject.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="text-center text-gray-500 py-3">No EOC Practice data available for ${sectionKey}.</td></tr>`;
        return;
    }
    eocQuizDataForSubject.forEach(item => {
        const row = tbody.insertRow();
        if (item.latestScore !== "N/A") { 
            row.className = 'clickable-row';
            // Pass the originalName (which is the AssessmentName from feed) to modal for filtering questionDetails
            row.onclick = () => openModal(`EOC Practice: ${item.name}`, { type: 'eoc_quiz', assessmentName: item.originalName || item.name }); 
        }
        row.innerHTML = `<td>${item.name}</td><td>${item.latestScore}</td><td>${item.date}</td><td>${item.classAvg}</td>`;
    });
}

function populateKhanSection(sectionKey, khanItems) {
    const container = document.getElementById(`${sectionKey}-khan-data`);
    if (!container) return;
    container.innerHTML = ''; 

    if (khanItems && khanItems.length > 0) {
        const table = document.createElement('table');
        table.className = 'min-w-full table';
        table.innerHTML = `<thead><tr><th>Assignment Name</th><th>Date</th><th>Your Score</th><th>Points Possible</th><th>Class Avg</th></tr></thead><tbody></tbody>`;
        const tbody = table.querySelector('tbody');
        khanItems.forEach(item => {
            const row = tbody.insertRow();
            row.className = 'clickable-row';
            row.innerHTML = `<td>${item.name}</td><td>${item.date}</td><td>${item.score}</td><td>${item.pointsPossible}</td><td>${item.classAvg}</td>`;
            row.onclick = () => openModal(`Khan Academy: ${item.name}`, { type: 'khan', assessmentName: item.name });
        });
        container.appendChild(table);
    } else {
        container.innerHTML = `<p class="text-gray-600 p-3">No Khan Academy Practice data available for ${sectionKey}.</p>`;
    }
}

function getPerformanceClass(score) {
    if (score >= 85) return 'performance-good';
    if (score >= 70) return 'performance-average';
    if (score > 0) return 'performance-poor'; 
    return 'bg-gray-200'; 
}

function populateCBSkills(sectionKey, skillsData) {
    const container = document.getElementById(`${sectionKey}-cb-skills-data`);
    if (!container) return;
    container.innerHTML = ''; 

    if (skillsData && skillsData.length > 0) {
        skillsData.forEach(skill => {
            const skillDiv = document.createElement('div');
            skillDiv.className = 'p-3 bg-gray-50 rounded-md border border-gray-200';
            const studentScore = typeof skill.score === 'number' ? skill.score : 0;
            const classAverage = typeof skill.classAvg === 'number' ? skill.classAvg : 0;
            const performanceClass = getPerformanceClass(studentScore);
            const textColorClass = studentScore > 0 ? performanceClass.replace('performance-', 'text-') : 'text-gray-500';
            
            skillDiv.innerHTML = `
                <div class="flex justify-between items-center mb-1">
                    <span class="text-sm font-medium text-gray-800">${skill.name || 'Unknown Skill'}</span>
                    <span class="text-xs ${textColorClass} font-semibold">${studentScore}%</span>
                </div>
                <div class="progress-bar-container">
                    <div class="progress-bar ${performanceClass}" style="width: ${studentScore}%"></div>
                </div>
                <p class="text-xs text-gray-500 mt-1">Class Avg: ${classAverage}%</p>`;
            container.appendChild(skillDiv);
        });
    } else {
         container.innerHTML = `<p class="text-gray-500 p-3">No Skill data available for ${sectionKey}. (Ensure SAT skill tags are populated in source data).</p>`;
    }
}

const modal = document.getElementById('detailModal');
const modalQuestionDetailsContainer = document.getElementById('modalQuestionDetails');

function openModal(title, contentDetails) { 
    if (!modal || !modalQuestionDetailsContainer || !currentStudentData.questionDetails) {
        console.error("Modal elements or question data not found for openModal.");
        return;
    }
    
    const modalHeaderH2 = modal.querySelector('.modal-header h2'); 
    if(modalHeaderH2) modalHeaderH2.textContent = title;
    
    modalQuestionDetailsContainer.innerHTML = ''; 
    
    let assessmentNamesToFilterBy = [];
    const baseAssessmentName = contentDetails.originalFeedName || contentDetails.assessmentName;

    // Check if this is an aggregate test that needs module questions
    if (aggregateTestToModulesMap[baseAssessmentName]) {
        assessmentNamesToFilterBy = aggregateTestToModulesMap[baseAssessmentName];
        console.log(`Modal: Aggregate test '${baseAssessmentName}', filtering for modules:`, assessmentNamesToFilterBy);
    } else {
        assessmentNamesToFilterBy.push(baseAssessmentName);
        console.log(`Modal: Standard assessment '${baseAssessmentName}', filtering for itself.`);
    }
    
    const studentQuestionDataForAssessment = currentStudentData.questionDetails.filter(q => 
        assessmentNamesToFilterBy.includes(q.AssessmentName)
    );

    if (studentQuestionDataForAssessment.length === 0) {
        modalQuestionDetailsContainer.innerHTML = `<p>No detailed question data available for "${baseAssessmentName}". This might be an aggregate score entry, or question details are linked to sub-modules not yet mapped for modal view.</p>`;
         if (aggregateTestToModulesMap[baseAssessmentName]) {
            modalQuestionDetailsContainer.innerHTML += `<p>Attempted to find questions for modules: ${assessmentNamesToFilterBy.join(', ')}.</p><p>Ensure 'aggregateTestToModulesMap' in script.js is correct and module names match 'AssessmentName' in QuestionDetails feed.</p>`;
        }
    } else {
        studentQuestionDataForAssessment.sort((a,b) => (parseFloat(a.QuestionSequenceInQuiz) || 0) - (parseFloat(b.QuestionSequenceInQuiz) || 0) );
        studentQuestionDataForAssessment.forEach((q, i) => {
            const d = document.createElement('div');
            let statusText, statusClass;
            const isCorrect = String(q.IsCorrect).toLowerCase() === 'true';
            const studentAnswer = q.StudentAnswer !== null && q.StudentAnswer !== undefined && String(q.StudentAnswer).trim() !== "" ? String(q.StudentAnswer) : "N/A";

            if (studentAnswer === "N/A") { 
                statusText = 'Unanswered';
                statusClass = 'bg-yellow-50 border-yellow-200 text-yellow-700';
            } else if (isCorrect) {
                statusText = 'Correct';
                statusClass = 'bg-green-50 border-green-200 text-green-700';
            } else {
                statusText = 'Incorrect';
                statusClass = 'bg-red-50 border-red-200 text-red-700';
            }
            
            const classAvgPoints = parseFloat(q.ClassAveragePoints_Question);
            const pointsPossible = parseFloat(q.PointsPossible_Question) || 1;
            let classCorrectPercentText = "N/A";
            if (!isNaN(classAvgPoints) && pointsPossible > 0) {
                const classCorrectPercent = (classAvgPoints / pointsPossible * 100);
                classCorrectPercentText = `${classCorrectPercent.toFixed(0)}% ${classCorrectPercent > 75 ? '<span class="arrow-up">↑</span>' : (classCorrectPercent < 50 ? '<span class="arrow-down">↓</span>' : '')}`;
            }

            d.className = `p-2 border rounded-md ${statusClass}`;
            d.innerHTML = `
                <p class="font-medium text-gray-700">Q${q.QuestionSequenceInQuiz || (i+1)} (${q.AssessmentName}): ${q.QuestionText_fromMetadata || 'N/A'}</p>
                <p>Your Answer: <span class="font-semibold">${studentAnswer}</span> (${statusText})</p>
                <p>Points: ${q.PointsEarned !== null && q.PointsEarned !== undefined ? q.PointsEarned : 0} / ${pointsPossible}</p>
                <p>Skill: ${q.SAT_Skill_Tag || 'N/A'}</p>
                <p class="text-xs text-gray-500">Class Avg Performance: ${classCorrectPercentText}</p>`;
            modalQuestionDetailsContainer.appendChild(d);
        });
    }
    
    if(modalDonutChartInstance) modalDonutChartInstance.destroy();
    if(modalLineChartInstance) modalLineChartInstance.destroy();
    
    let correctCount = 0;
    let incorrectCount = 0;
    let unansweredCount = 0;

    studentQuestionDataForAssessment.forEach(q => {
        const isCorrect = String(q.IsCorrect).toLowerCase() === 'true';
        const studentAnswer = q.StudentAnswer !== null && q.StudentAnswer !== undefined && String(q.StudentAnswer).trim() !== "" ? String(q.StudentAnswer) : "N/A";
        if (studentAnswer === "N/A") unansweredCount++;
        else if (isCorrect) correctCount++;
        else incorrectCount++;
    });
    
    const donutCtx = document.getElementById('modalDonutChart')?.getContext('2d');
    if (donutCtx) { 
        modalDonutChartInstance = new Chart(donutCtx,{type:'doughnut',data:{labels:['Correct','Incorrect','Unanswered'],datasets:[{data:[correctCount, incorrectCount, unansweredCount],backgroundColor:['#4caf50','#f44336','#9e9e9e'], hoverOffset: 4}]},options:{responsive:true,maintainAspectRatio:true,plugins:{legend:{position:'bottom'}},cutout:'50%'}});
    }

    const lineCtx = document.getElementById('modalLineChart')?.getContext('2d');
    if (lineCtx) { 
        modalLineChartInstance=new Chart(lineCtx,{type:'line',data:{labels:['A1','A2','A3','A4','A5'],datasets:[{label:'Your Score Trend (Sample)',data:Array.from({length:5},()=>50+Math.random()*40),borderColor:'#2a5266',tension:0.1,fill:false}]},options:{responsive:true,maintainAspectRatio:true,scales:{y:{beginAtZero:true,max:100}}}});
    }
    if(modal) modal.style.display="block";
}

function closeModal() { 
    if(modal) modal.style.display = "none"; 
    if (modalDonutChartInstance) modalDonutChartInstance.destroy(); 
    if (modalLineChartInstance) modalLineChartInstance.destroy(); 
}

window.onclick = function(event) { 
    if (event.target == modal) closeModal(); 
}
