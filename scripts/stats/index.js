// @ts-check
import { Octokit } from '@octokit/action';
import { execSync } from 'child_process';
import { appendFileSync, readFileSync, writeFileSync } from 'fs';

const octokit = new Octokit();
const owner = 'snowpackjs';
const repo = 'astro';

// Relevant IDs captured via: https://docs.github.com/en/graphql/overview/explorer
// query {
//   repository(name:"astro", owner:"snowpackjs") {
//     project(number: 3) {
//       columns(first: 100) {
//         nodes {
//           id
//           databaseId
//           name
//         }
//       }
//     }
//   }
// }

const COLUMN_ID_BUGS_NEEDS_TRIAGE = 14724521;
const COLUMN_ID_BUGS_ACCEPTED = 14724515;
const COLUMN_ID_BUGS_PRIORITIZED = 14946516;
const COLUMN_ID_RFCS_NEEDS_DISCUSSION = 14946333;
const COLUMN_ID_RFCS_NEEDS_WORK = 14946353;
const COLUMN_ID_RFCS_ACCEPTED = 14946335;
const COLUMN_ID_RFCS_PRIORITIZED = 14946454;

// CREATE LOCAL COPIES OF DATA (Useful for debugging locally)
// Command:
//   GITHUB_ACTION=test GITHUB_TOKEN=XXXXXXXXX node scripts/stats/index.js
// Code:
//   writeFileSync('pulls.json', JSON.stringify(await octokit.paginate("GET /repos/{owner}/{repo}/pulls", {
//     owner,
//     repo,
//   })));
//   writeFileSync('issues.json', JSON.stringify(await octokit.paginate("GET /repos/{owner}/{repo}/issues", {
//     owner,
//     repo,
//   })));
//   const issues = JSON.parse(readFileSync('issues.json').toString());
//   const pulls = JSON.parse(readFileSync('pulls.json').toString());

async function countCards(column_id) {
  return octokit.paginate('GET /projects/columns/{column_id}/cards', {
    column_id,
    mediaType: {
      previews: ['inertia'],
    },
  });
}
async function countCommits(since) {
  return octokit.paginate('GET /repos/{owner}/{repo}/commits', {
    owner,
    repo,
    since: since.toISOString(),
  });
}

export async function run() {
  const twentyFourHoursAgo = new Date();
  twentyFourHoursAgo.setDate(twentyFourHoursAgo.getDate() - 1);

  const allOpenIssues = await octokit.paginate('GET /repos/{owner}/{repo}/issues', {
    owner,
    repo,
  });
  const openIssues = allOpenIssues.filter((iss) => !iss.pull_request);
  const openPulls = allOpenIssues.filter((iss) => iss.pull_request);

  const allIssuesLastTwentyFourHours = await octokit.paginate('GET /repos/{owner}/{repo}/issues', {
    owner,
    repo,
    state: 'all',
    per_page: 100,
    since: twentyFourHoursAgo.toISOString(),
  });
  const issuesLastTwentyFourHours = allIssuesLastTwentyFourHours.filter((iss) => new Date(iss.created_at) > twentyFourHoursAgo && !iss.pull_request);
  const pullsLastTwentyFourHours = allIssuesLastTwentyFourHours.filter((iss) => new Date(iss.created_at) > twentyFourHoursAgo && iss.pull_request);

  const entry = [
    // Date (Human Readable)
    `"${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}"`,
    // Commits in last 24 hours
    (await countCommits(twentyFourHoursAgo)).length,
    // New Issues(All) in last 24 hours
    issuesLastTwentyFourHours.length,
    // New Issues(Bugs) in last 24 hours
    issuesLastTwentyFourHours.filter((iss) => iss.title.startsWith('🐛 BUG:')).length,
    // New Issues(RFC) in last 24 hours
    issuesLastTwentyFourHours.filter((iss) => iss.title.startsWith('💡 RFC:')).length,
    // New Issues(Docs) in last 24 hours
    issuesLastTwentyFourHours.filter((iss) => iss.title.startsWith('📘 DOC:')).length,
    // New Pull Requests in last 24 hours
    pullsLastTwentyFourHours.length,
    // Pull requests
    openPulls.length,
    // Open Issues
    openIssues.length,
    // Bugs: Needs Triage
    (await countCards(COLUMN_ID_BUGS_NEEDS_TRIAGE)).length,
    // Bugs: Accepted
    (await countCards(COLUMN_ID_BUGS_ACCEPTED)).length + (await countCards(COLUMN_ID_BUGS_PRIORITIZED)).length,
    // RFC: Needs Discussion
    (await countCards(COLUMN_ID_RFCS_NEEDS_DISCUSSION)).length,
    // RFC: Needs Work
    (await countCards(COLUMN_ID_RFCS_NEEDS_WORK)).length,
    // RFC: Accepted
    (await countCards(COLUMN_ID_RFCS_ACCEPTED)).length + (await countCards(COLUMN_ID_RFCS_PRIORITIZED)).length,
    // Date (ISO)
    `"${new Date().toISOString()}"`,
  ];

  appendFileSync('scripts/stats/stats.csv', entry.join(',') + '\n');
}

run();
