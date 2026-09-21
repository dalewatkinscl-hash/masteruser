'use strict';

/**
 * Daily trivia question bank for the Employee Portal Fun tab.
 *
 * WHERE TO EDIT: this file (`functions/trivia.js`) — QUESTIONS array below.
 * Default bank picks start from the Europe/London date, then skip any IDs in
 * `trivia_spent` so questions are not reused until the whole bank is exhausted.
 * Admin `fun_content` rows with scheduledFor override a day entirely.
 * After editing, redeploy: firebase deploy --only functions:getDailyTrivia,functions:submitTriviaAnswer,functions:getProfileWidgets
 */

const QUESTIONS = [
  {
    id: 'h001',
    prompt: 'Who first published the Schwarzschild metric describing spacetime around a non-rotating mass in 1916?',
    options: ['Stephen Hawking', 'Karl Schwarzschild', 'Subrahmanyan Chandrasekhar', 'Albert Einstein'],
    correctIndex: 1,
  },
  {
    id: 'h002',
    prompt: 'In EU drivers’ hours rules for most HGV/PCV operations, what is the maximum daily driving time before an extended day is used?',
    options: ['8 hours', '9 hours', '10 hours', '11 hours'],
    correctIndex: 1,
  },
  {
    id: 'h003',
    prompt: 'Which chemical element has the atomic number 26?',
    options: ['Nickel', 'Cobalt', 'Iron', 'Manganese'],
    correctIndex: 2,
  },
  {
    id: 'h004',
    prompt: 'The Battle of Hastings was fought in which year?',
    options: ['1016', '1066', '1087', '1215'],
    correctIndex: 1,
  },
  {
    id: 'h005',
    prompt: 'What is the only even prime number?',
    options: ['0', '1', '2', '4'],
    correctIndex: 2,
  },
  {
    id: 'h006',
    prompt: 'Which Shakespeare play features the characters Rosencrantz and Guildenstern?',
    options: ['Macbeth', 'King Lear', 'Hamlet', 'Othello'],
    correctIndex: 2,
  },
  {
    id: 'h007',
    prompt: 'Mount Chimborazo’s summit is often cited as the farthest point from Earth’s centre because of what?',
    options: [
      'It is the tallest mountain above sea level',
      'Earth’s equatorial bulge',
      'It sits on the densest crust',
      'Tidal locking with the Moon',
    ],
    correctIndex: 1,
  },
  {
    id: 'h008',
    prompt: 'In UK road transport, what does the abbreviation “DVSA” stand for?',
    options: [
      'Driver and Vehicle Standards Agency',
      'Department for Vehicle Safety Administration',
      'Driver Verification and Safety Authority',
      'Domestic Vehicle Standards Association',
    ],
    correctIndex: 0,
  },
  {
    id: 'h009',
    prompt: 'Which composer wrote “The Planets” suite?',
    options: ['Edward Elgar', 'Gustav Holst', 'Benjamin Britten', 'Ralph Vaughan Williams'],
    correctIndex: 1,
  },
  {
    id: 'h010',
    prompt: 'What is the SI unit of electrical resistance?',
    options: ['Volt', 'Ampere', 'Ohm', 'Watt'],
    correctIndex: 2,
  },
  {
    id: 'h011',
    prompt: 'Which treaty formally ended the First World War with Germany in 1919?',
    options: ['Treaty of Versailles', 'Treaty of Trianon', 'Treaty of Brest-Litovsk', 'Locarno Treaties'],
    correctIndex: 0,
  },
  {
    id: 'h012',
    prompt: 'In classical mechanics, Kepler’s second law states that a line joining a planet and the Sun sweeps out equal areas in equal times. What does that imply about orbital speed?',
    options: [
      'Speed is constant everywhere',
      'The planet moves faster when closer to the Sun',
      'The planet moves slower when closer to the Sun',
      'Speed depends only on mass',
    ],
    correctIndex: 1,
  },
  {
    id: 'h013',
    prompt: 'Which UK city was historically known as Deva Victrix in Roman Britain?',
    options: ['York', 'Chester', 'Bath', 'Colchester'],
    correctIndex: 1,
  },
  {
    id: 'h014',
    prompt: 'What is the approximate speed of light in a vacuum?',
    options: ['3×10⁶ m/s', '3×10⁷ m/s', '3×10⁸ m/s', '3×10⁹ m/s'],
    correctIndex: 2,
  },
  {
    id: 'h015',
    prompt: 'Who painted “The Night Watch”?',
    options: ['Johannes Vermeer', 'Rembrandt', 'Frans Hals', 'Pieter Bruegel the Elder'],
    correctIndex: 1,
  },
  {
    id: 'h016',
    prompt: 'In genetics, what does “PCR” stand for?',
    options: [
      'Protein Chain Reaction',
      'Polymerase Chain Reaction',
      'Primary Cell Replication',
      'Plasma Chromosome Repair',
    ],
    correctIndex: 1,
  },
  {
    id: 'h017',
    prompt: 'Which strait separates European Turkey from Asian Turkey?',
    options: ['Bosporus', 'Dardanelles', 'Strait of Gibraltar', 'Kerch Strait'],
    correctIndex: 0,
  },
  {
    id: 'h018',
    prompt: 'Under GB tachograph rules, what is the minimum regular daily rest period for most drivers?',
    options: ['8 hours', '9 hours', '11 hours', '12 hours'],
    correctIndex: 2,
  },
  {
    id: 'h019',
    prompt: 'Which Nobel Prize–winning economist wrote “The Wealth of Nations”?',
    options: ['John Maynard Keynes', 'Adam Smith', 'David Ricardo', 'Friedrich Hayek'],
    correctIndex: 1,
  },
  {
    id: 'h020',
    prompt: 'What is the chemical formula for ozone?',
    options: ['O₂', 'O₃', 'CO₂', 'NO₂'],
    correctIndex: 1,
  },
  {
    id: 'h021',
    prompt: 'Which English monarch was executed in 1649?',
    options: ['Charles I', 'Charles II', 'James I', 'Henry VIII'],
    correctIndex: 0,
  },
  {
    id: 'h022',
    prompt: 'In computing, what does “HTTPS” add compared with HTTP?',
    options: [
      'Faster packet routing',
      'TLS encryption and integrity',
      'Guaranteed offline caching',
      'IPv6-only addressing',
    ],
    correctIndex: 1,
  },
  {
    id: 'h023',
    prompt: 'Which desert is the largest hot desert in the world?',
    options: ['Gobi', 'Arabian', 'Kalahari', 'Sahara'],
    correctIndex: 3,
  },
  {
    id: 'h024',
    prompt: 'Who formulated the uncertainty principle in quantum mechanics?',
    options: ['Niels Bohr', 'Werner Heisenberg', 'Erwin Schrödinger', 'Max Planck'],
    correctIndex: 1,
  },
  {
    id: 'h025',
    prompt: 'The Magna Carta was sealed by King John at which location?',
    options: ['Westminster', 'Runnymede', 'Canterbury', 'Winchester'],
    correctIndex: 1,
  },
  {
    id: 'h026',
    prompt: 'Which blood type is generally considered the universal donor for red cell transfusion (in standard ABO terms)?',
    options: ['AB positive', 'O negative', 'A negative', 'B positive'],
    correctIndex: 1,
  },
  {
    id: 'h027',
    prompt: 'What is the capital city of Kazakhstan?',
    options: ['Almaty', 'Astana', 'Shymkent', 'Karaganda'],
    correctIndex: 1,
  },
  {
    id: 'h028',
    prompt: 'In music theory, how many semitones are in a perfect fifth?',
    options: ['5', '6', '7', '8'],
    correctIndex: 2,
  },
  {
    id: 'h029',
    prompt: 'Which particle mediates the electromagnetic force?',
    options: ['Gluon', 'Photon', 'W boson', 'Higgs boson'],
    correctIndex: 1,
  },
  {
    id: 'h030',
    prompt: 'The Mary Celeste is famous for what maritime mystery?',
    options: [
      'Sinking after hitting an iceberg',
      'Being found abandoned with no crew',
      'Mutiny during the Napoleonic Wars',
      'Discovering Antarctica',
    ],
    correctIndex: 1,
  },
  {
    id: 'h031',
    prompt: 'Which mathematician proved Fermat’s Last Theorem in the 1990s?',
    options: ['Andrew Wiles', 'Terence Tao', 'Grigori Perelman', 'John Nash'],
    correctIndex: 0,
  },
  {
    id: 'h032',
    prompt: 'What does the “C” stand for in the aviation distress call “Mayday” etymology? (It comes from French “m’aider”.) Which language origin is correct?',
    options: ['Latin', 'French', 'German', 'Spanish'],
    correctIndex: 1,
  },
  {
    id: 'h033',
    prompt: 'Which organ produces insulin in the human body?',
    options: ['Liver', 'Pancreas', 'Spleen', 'Kidney'],
    correctIndex: 1,
  },
  {
    id: 'h034',
    prompt: 'In UK parliamentary history, who was the first female Prime Minister?',
    options: ['Theresa May', 'Margaret Thatcher', 'Barbara Castle', 'Nancy Astor'],
    correctIndex: 1,
  },
  {
    id: 'h035',
    prompt: 'What is the name of the boundary between Earth’s crust and mantle?',
    options: ['Gutenberg discontinuity', 'Mohorovičić discontinuity', 'Lehmann discontinuity', 'Conrad discontinuity'],
    correctIndex: 1,
  },
  {
    id: 'h036',
    prompt: 'Which novel begins with the line “Call me Ishmael”?',
    options: ['Moby-Dick', 'Treasure Island', 'Heart of Darkness', 'Lord Jim'],
    correctIndex: 0,
  },
  {
    id: 'h037',
    prompt: 'A tachograph’s primary legal purpose is to record which of the following?',
    options: [
      'Fuel economy only',
      'Driver hours, speed and distance',
      'Passenger occupancy',
      'Vehicle tax status',
    ],
    correctIndex: 1,
  },
  {
    id: 'h038',
    prompt: 'Which gas makes up the largest percentage of Earth’s atmosphere by volume?',
    options: ['Oxygen', 'Carbon dioxide', 'Nitrogen', 'Argon'],
    correctIndex: 2,
  },
  {
    id: 'h039',
    prompt: 'The currency of Switzerland is the:',
    options: ['Euro', 'Swiss franc', 'Krona', 'Schilling'],
    correctIndex: 1,
  },
  {
    id: 'h040',
    prompt: 'Which scientist is credited with discovering penicillin?',
    options: ['Louis Pasteur', 'Alexander Fleming', 'Robert Koch', 'Joseph Lister'],
    correctIndex: 1,
  },
  {
    id: 'h041',
    prompt: 'In Euclidean geometry, the sum of interior angles in a triangle is:',
    options: ['90°', '180°', '270°', '360°'],
    correctIndex: 1,
  },
  {
    id: 'h042',
    prompt: 'Which African river is the longest?',
    options: ['Congo', 'Nile', 'Niger', 'Zambezi'],
    correctIndex: 1,
  },
  {
    id: 'h043',
    prompt: 'What is the hexadecimal value of decimal 255?',
    options: ['EE', 'FF', '1F', 'F0'],
    correctIndex: 1,
  },
  {
    id: 'h044',
    prompt: 'Which planet has the most moons (as currently catalogued by major astronomy bodies, order-of-magnitude leader)?',
    options: ['Jupiter', 'Saturn', 'Uranus', 'Neptune'],
    correctIndex: 1,
  },
  {
    id: 'h045',
    prompt: 'The Beaufort scale measures:',
    options: ['Earthquake intensity', 'Wind force', 'Ocean salinity', 'Solar irradiance'],
    correctIndex: 1,
  },
  {
    id: 'h046',
    prompt: 'Which philosopher wrote “Critique of Pure Reason”?',
    options: ['Hegel', 'Kant', 'Hume', 'Descartes'],
    correctIndex: 1,
  },
  {
    id: 'h047',
    prompt: 'In UK law, CPC Periodic Training for professional drivers generally requires how many hours over five years?',
    options: ['21 hours', '28 hours', '35 hours', '42 hours'],
    correctIndex: 2,
  },
  {
    id: 'h048',
    prompt: 'What is the rarest naturally occurring blood type ABO/Rh combination in most populations?',
    options: ['O positive', 'AB negative', 'A positive', 'B positive'],
    correctIndex: 1,
  },
  {
    id: 'h049',
    prompt: 'Which city hosted the ancient Library of Alexandria?',
    options: ['Athens', 'Rome', 'Alexandria', 'Byzantium'],
    correctIndex: 2,
  },
  {
    id: 'h050',
    prompt: 'Avogadro’s number is approximately:',
    options: ['6.02×10²¹', '6.02×10²²', '6.02×10²³', '6.02×10²⁴'],
    correctIndex: 2,
  },
];

function getLondonDayKey(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function dayOrdinal(dayKey) {
  const [year, month, day] = String(dayKey || '').split('-').map(Number);
  if (!year || !month || !day) return 0;
  return Math.floor(Date.UTC(year, month - 1, day) / 86400000);
}

function getQuestionForDay(dayKey = getLondonDayKey()) {
  // Sequential by calendar day so adjacent dates cannot collide (hash % 50 could).
  const index = ((dayOrdinal(dayKey) % QUESTIONS.length) + QUESTIONS.length) % QUESTIONS.length;
  const question = QUESTIONS[index];
  return {
    dayKey,
    questionId: question.id,
    prompt: question.prompt,
    options: question.options,
    correctIndex: question.correctIndex,
  };
}

function questionById(questionId) {
  return QUESTIONS.find((row) => row.id === questionId) || null;
}

/**
 * Pick a bank question that has not been used before (trivia_spent/{id}).
 * Locks the choice on trivia_day_locks/{dayKey} so the day stays stable.
 * Questions stay burned for the whole cycle. Only when every bank ID is spent
 * do we wipe spent and start a new cycle.
 */
async function resolveBankQuestion(db, dayKey, FieldValue) {
  const lockRef = db.collection('trivia_day_locks').doc(dayKey);
  const lockSnap = await lockRef.get();
  if (lockSnap.exists) {
    const lockedId = String(lockSnap.data()?.questionId || '');
    const locked = questionById(lockedId);
    if (locked) {
      return {
        dayKey,
        questionId: locked.id,
        prompt: locked.prompt,
        options: locked.options,
        correctIndex: locked.correctIndex,
        source: 'bank',
      };
    }
  }

  // Heal drift: union spent with every historical day lock so reused IDs stay burned.
  const [spentSnap, locksSnap] = await Promise.all([
    db.collection('trivia_spent').limit(Math.max(QUESTIONS.length + 50, 300)).get(),
    db.collection('trivia_day_locks').limit(400).get().catch(() => ({ docs: [] })),
  ]);
  const spent = new Set(spentSnap.docs.map((doc) => doc.id));
  locksSnap.docs.forEach((doc) => {
    const qid = String(doc.data()?.questionId || '');
    if (qid) spent.add(qid);
  });

  const bankIds = QUESTIONS.map((q) => q.id);
  const allBurned = bankIds.every((id) => spent.has(id));
  let recycled = false;

  if (allBurned) {
    recycled = true;
    const wipe = db.batch();
    spentSnap.docs.forEach((doc) => wipe.delete(doc.ref));
    await wipe.commit();
    spent.clear();
  }

  const available = QUESTIONS.filter((q) => !spent.has(q.id));
  if (!available.length) {
    // Should not happen after recycle; fall back to ordinal pick.
    const start = ((dayOrdinal(dayKey) % QUESTIONS.length) + QUESTIONS.length) % QUESTIONS.length;
    available.push(QUESTIONS[start]);
  }

  // Stable pick among available for this day (not among the full bank).
  const start = ((dayOrdinal(dayKey) % available.length) + available.length) % available.length;
  const chosen = available[start];

  const batch = db.batch();
  batch.set(lockRef, {
    questionId: chosen.id,
    lockedAt: FieldValue.serverTimestamp(),
    recycled,
  });
  batch.set(db.collection('trivia_spent').doc(chosen.id), {
    questionId: chosen.id,
    usedOnDayKey: dayKey,
    usedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  // Backfill any lock-known burns missing from spent (except when we just recycled).
  if (!recycled) {
    for (const id of spent) {
      if (id === chosen.id) continue;
      if (!questionById(id)) continue;
      if (spentSnap.docs.some((doc) => doc.id === id)) continue;
      batch.set(db.collection('trivia_spent').doc(id), {
        questionId: id,
        usedOnDayKey: 'backfill',
        usedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }
  }
  await batch.commit();

  return {
    dayKey,
    questionId: chosen.id,
    prompt: chosen.prompt,
    options: chosen.options,
    correctIndex: chosen.correctIndex,
    source: 'bank',
  };
}

function publicQuestion(question) {
  return {
    dayKey: question.dayKey,
    questionId: question.questionId,
    prompt: question.prompt,
    options: question.options,
  };
}

/** Hide prompt/options until the player starts the timer. */
function hiddenQuestion(question) {
  return {
    dayKey: question.dayKey,
    questionId: question.questionId,
    prompt: null,
    options: null,
  };
}

/** Format milliseconds for trivia leaderboard (e.g. 4.2s, 1:05). */
function formatTriviaElapsed(elapsedMs) {
  const ms = Math.max(0, Math.floor(Number(elapsedMs) || 0));
  if (ms < 1000) return `${(ms / 1000).toFixed(2)}s`;
  const totalSec = ms / 1000;
  if (totalSec < 60) return `${totalSec.toFixed(1)}s`;
  const min = Math.floor(totalSec / 60);
  const sec = Math.round(totalSec % 60);
  return `${min}:${String(sec).padStart(2, '0')}`;
}

module.exports = {
  QUESTIONS,
  getLondonDayKey,
  getQuestionForDay,
  resolveBankQuestion,
  questionById,
  publicQuestion,
  hiddenQuestion,
  formatTriviaElapsed,
};
