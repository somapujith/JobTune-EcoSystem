'use strict';

/**
 * Worker port of backend/src/routes/practice.js (mounted at /api/practice).   Wave 3F, slice "large3".
 *
 * Ported at git HEAD 38d8130a (the Express file has no uncommitted edits). Notes: docs/migration/wave/large3.md.
 *
 * ENDPOINT CHECKLIST (Express registration order = manifest order; ORDER IS BEHAVIOUR, do not reorder).
 * Every endpoint is authenticateToken -> requirePlan(1), exactly as docs/migration/manifest.render.json says:
 *    1. GET  /problems                        (Express line  666)
 *    2. GET  /problems/:id                    (Express line  758)
 *    3. POST /problems/:id/run                (Express line  801)
 *    4. POST /problems/:id/submit             (Express line  855)
 *    5. POST /problems/:id/hint               (Express line  923)
 *    6. GET  /assessments                     (Express line  966)
 *    7. GET  /assessments/:id                 (Express line 1009)
 *    8. POST /assessments/:id/submit          (Express line 1045)
 *    9. GET  /stats                           (Express line 1114)
 *   10. POST /problems/:id/bookmark           (Express line 1210)
 * tests/worker/large3/practice.manifest.test.js diffs this router against that manifest.
 *
 * Deliberate differences from the Express file (each is platform-forced; see the notes file):
 *   - the module-scope async block that created the three practice tables at boot is NOT ported
 *     (ADR 6.5: no schema bootstrap on the Worker). The three tables must already exist in Neon.
 *   - the AI client is the injected `aiClient` service instead of a module import.
 *   - db access is the request-scoped getDb(c) instead of the shared pool.
 * Everything else (data, prompts, SQL, validation, status codes, response bodies, log messages) is verbatim,
 * including behaviour that looks like a bug; those are recorded in the notes file and are NOT fixed here.
 */
const { createRouter } = require('../lib/routes');
const { authenticateToken } = require('../middleware/auth');
const { requirePlan } = require('../middleware/requirePlan');
const { getServices } = require('../lib/context');
const { getDb } = require('../db');
const { getBody, getQuery } = require('../lib/http');

const router = createRouter();

// ── Fallback Problems ───────────────────────────────────────────────────────
const FALLBACK_PROBLEMS = [
  {
    id: 'two-sum',
    title: 'Two Sum',
    difficulty: 'Easy',
    category: 'Arrays',
    acceptance: 49.2,
    description: 'Given an array of integers `nums` and an integer `target`, return indices of the two numbers such that they add up to `target`.\n\nYou may assume that each input would have exactly one solution, and you may not use the same element twice.\n\nYou can return the answer in any order.',
    examples: [
      { input: 'nums = [2,7,11,15], target = 9', output: '[0,1]', explanation: 'Because nums[0] + nums[1] == 9, we return [0, 1].' },
      { input: 'nums = [3,2,4], target = 6', output: '[1,2]', explanation: '' },
      { input: 'nums = [3,3], target = 6', output: '[0,1]', explanation: '' },
    ],
    constraints: ['2 <= nums.length <= 10^4', '-10^9 <= nums[i] <= 10^9', '-10^9 <= target <= 10^9', 'Only one valid answer exists.'],
    testCases: [
      { input: '[2,7,11,15]\n9', expected: '[0,1]' },
      { input: '[3,2,4]\n6', expected: '[1,2]' },
      { input: '[3,3]\n6', expected: '[0,1]' },
    ],
    tags: ['Hash Table', 'Array'],
    starterCode: {
      javascript: 'function twoSum(nums, target) {\n  // Your code here\n}',
      python: 'def two_sum(nums, target):\n    # Your code here\n    pass',
      java: 'class Solution {\n    public int[] twoSum(int[] nums, int target) {\n        // Your code here\n        return new int[]{};\n    }\n}',
      cpp: 'class Solution {\npublic:\n    vector<int> twoSum(vector<int>& nums, int target) {\n        // Your code here\n        return {};\n    }\n};',
    },
  },
  {
    id: 'reverse-string',
    title: 'Reverse String',
    difficulty: 'Easy',
    category: 'Strings',
    acceptance: 75.1,
    description: 'Write a function that reverses a string. The input string is given as an array of characters `s`.\n\nYou must do this by modifying the input array in-place with O(1) extra memory.',
    examples: [
      { input: 's = ["h","e","l","l","o"]', output: '["o","l","l","e","h"]', explanation: '' },
      { input: 's = ["H","a","n","n","a","h"]', output: '["h","a","n","n","a","H"]', explanation: '' },
    ],
    constraints: ['1 <= s.length <= 10^5', 's[i] is a printable ASCII character.'],
    testCases: [
      { input: '["h","e","l","l","o"]', expected: '["o","l","l","e","h"]' },
      { input: '["H","a","n","n","a","h"]', expected: '["h","a","n","n","a","H"]' },
    ],
    tags: ['Two Pointers', 'String'],
    starterCode: {
      javascript: 'function reverseString(s) {\n  // Your code here\n}',
      python: 'def reverse_string(s):\n    # Your code here\n    pass',
      java: 'class Solution {\n    public void reverseString(char[] s) {\n        // Your code here\n    }\n}',
      cpp: 'class Solution {\npublic:\n    void reverseString(vector<char>& s) {\n        // Your code here\n    }\n};',
    },
  },
  {
    id: 'valid-parentheses',
    title: 'Valid Parentheses',
    difficulty: 'Easy',
    category: 'Strings',
    acceptance: 40.5,
    description: 'Given a string `s` containing just the characters \'(\', \')\', \'{\', \'}\', \'[\' and \']\', determine if the input string is valid.\n\nAn input string is valid if:\n1. Open brackets must be closed by the same type of brackets.\n2. Open brackets must be closed in the correct order.\n3. Every close bracket has a corresponding open bracket of the same type.',
    examples: [
      { input: 's = "()"', output: 'true', explanation: '' },
      { input: 's = "()[]{}"', output: 'true', explanation: '' },
      { input: 's = "(]"', output: 'false', explanation: '' },
    ],
    constraints: ['1 <= s.length <= 10^4', 's consists of parentheses only \'()[]{}\''],
    testCases: [
      { input: '()', expected: 'true' },
      { input: '()[]{}', expected: 'true' },
      { input: '(]', expected: 'false' },
    ],
    tags: ['Stack', 'String'],
    starterCode: {
      javascript: 'function isValid(s) {\n  // Your code here\n}',
      python: 'def is_valid(s):\n    # Your code here\n    pass',
      java: 'class Solution {\n    public boolean isValid(String s) {\n        // Your code here\n        return false;\n    }\n}',
      cpp: 'class Solution {\npublic:\n    bool isValid(string s) {\n        // Your code here\n        return false;\n    }\n};',
    },
  },
  {
    id: 'merge-sorted-arrays',
    title: 'Merge Two Sorted Arrays',
    difficulty: 'Easy',
    category: 'Arrays',
    acceptance: 45.8,
    description: 'You are given two integer arrays `nums1` and `nums2`, sorted in non-decreasing order, and two integers `m` and `n`, representing the number of elements in `nums1` and `nums2` respectively.\n\nMerge `nums1` and `nums2` into a single array sorted in non-decreasing order.',
    examples: [
      { input: 'nums1 = [1,2,3,0,0,0], m = 3, nums2 = [2,5,6], n = 3', output: '[1,2,2,3,5,6]', explanation: 'The arrays we are merging are [1,2,3] and [2,5,6]. The result is [1,2,2,3,5,6].' },
    ],
    constraints: ['nums1.length == m + n', 'nums2.length == n', '0 <= m, n <= 200'],
    testCases: [
      { input: '[1,2,3,0,0,0]\n3\n[2,5,6]\n3', expected: '[1,2,2,3,5,6]' },
      { input: '[1]\n1\n[]\n0', expected: '[1]' },
    ],
    tags: ['Array', 'Two Pointers', 'Sorting'],
    starterCode: {
      javascript: 'function merge(nums1, m, nums2, n) {\n  // Your code here\n}',
      python: 'def merge(nums1, m, nums2, n):\n    # Your code here\n    pass',
      java: 'class Solution {\n    public void merge(int[] nums1, int m, int[] nums2, int n) {\n        // Your code here\n    }\n}',
      cpp: 'class Solution {\npublic:\n    void merge(vector<int>& nums1, int m, vector<int>& nums2, int n) {\n        // Your code here\n    }\n};',
    },
  },
  {
    id: 'binary-search',
    title: 'Binary Search',
    difficulty: 'Easy',
    category: 'Arrays',
    acceptance: 55.3,
    description: 'Given an array of integers `nums` which is sorted in ascending order, and an integer `target`, write a function to search `target` in `nums`. If `target` exists, then return its index. Otherwise, return -1.\n\nYou must write an algorithm with O(log n) runtime complexity.',
    examples: [
      { input: 'nums = [-1,0,3,5,9,12], target = 9', output: '4', explanation: '9 exists in nums and its index is 4.' },
      { input: 'nums = [-1,0,3,5,9,12], target = 2', output: '-1', explanation: '2 does not exist in nums so return -1.' },
    ],
    constraints: ['1 <= nums.length <= 10^4', '-10^4 < nums[i], target < 10^4', 'All integers in nums are unique.', 'nums is sorted in ascending order.'],
    testCases: [
      { input: '[-1,0,3,5,9,12]\n9', expected: '4' },
      { input: '[-1,0,3,5,9,12]\n2', expected: '-1' },
    ],
    tags: ['Array', 'Binary Search'],
    starterCode: {
      javascript: 'function search(nums, target) {\n  // Your code here\n}',
      python: 'def search(nums, target):\n    # Your code here\n    pass',
      java: 'class Solution {\n    public int search(int[] nums, int target) {\n        // Your code here\n        return -1;\n    }\n}',
      cpp: 'class Solution {\npublic:\n    int search(vector<int>& nums, int target) {\n        // Your code here\n        return -1;\n    }\n};',
    },
  },
  {
    id: 'max-depth-binary-tree',
    title: 'Maximum Depth of Binary Tree',
    difficulty: 'Easy',
    category: 'Trees',
    acceptance: 72.9,
    description: 'Given the `root` of a binary tree, return its maximum depth.\n\nA binary tree\'s maximum depth is the number of nodes along the longest path from the root node down to the farthest leaf node.',
    examples: [
      { input: 'root = [3,9,20,null,null,15,7]', output: '3', explanation: '' },
      { input: 'root = [1,null,2]', output: '2', explanation: '' },
    ],
    constraints: ['The number of nodes in the tree is in the range [0, 10^4].', '-100 <= Node.val <= 100'],
    testCases: [
      { input: '[3,9,20,null,null,15,7]', expected: '3' },
      { input: '[1,null,2]', expected: '2' },
    ],
    tags: ['Tree', 'DFS', 'BFS'],
    starterCode: {
      javascript: 'function maxDepth(root) {\n  // Your code here\n}',
      python: 'def max_depth(root):\n    # Your code here\n    pass',
      java: 'class Solution {\n    public int maxDepth(TreeNode root) {\n        // Your code here\n        return 0;\n    }\n}',
      cpp: 'class Solution {\npublic:\n    int maxDepth(TreeNode* root) {\n        // Your code here\n        return 0;\n    }\n};',
    },
  },
  {
    id: 'climbing-stairs',
    title: 'Climbing Stairs',
    difficulty: 'Easy',
    category: 'DP',
    acceptance: 51.4,
    description: 'You are climbing a staircase. It takes `n` steps to reach the top.\n\nEach time you can either climb 1 or 2 steps. In how many distinct ways can you climb to the top?',
    examples: [
      { input: 'n = 2', output: '2', explanation: 'There are two ways: 1+1 and 2.' },
      { input: 'n = 3', output: '3', explanation: 'There are three ways: 1+1+1, 1+2, and 2+1.' },
    ],
    constraints: ['1 <= n <= 45'],
    testCases: [
      { input: '2', expected: '2' },
      { input: '3', expected: '3' },
      { input: '5', expected: '8' },
    ],
    tags: ['Dynamic Programming', 'Math'],
    starterCode: {
      javascript: 'function climbStairs(n) {\n  // Your code here\n}',
      python: 'def climb_stairs(n):\n    # Your code here\n    pass',
      java: 'class Solution {\n    public int climbStairs(int n) {\n        // Your code here\n        return 0;\n    }\n}',
      cpp: 'class Solution {\npublic:\n    int climbStairs(int n) {\n        // Your code here\n        return 0;\n    }\n};',
    },
  },
  {
    id: 'longest-common-subsequence',
    title: 'Longest Common Subsequence',
    difficulty: 'Medium',
    category: 'DP',
    acceptance: 58.7,
    description: 'Given two strings `text1` and `text2`, return the length of their longest common subsequence. If there is no common subsequence, return 0.\n\nA subsequence of a string is a new string generated from the original string with some characters (can be none) deleted without changing the relative order of the remaining characters.',
    examples: [
      { input: 'text1 = "abcde", text2 = "ace"', output: '3', explanation: 'The longest common subsequence is "ace" and its length is 3.' },
      { input: 'text1 = "abc", text2 = "abc"', output: '3', explanation: 'The longest common subsequence is "abc" and its length is 3.' },
      { input: 'text1 = "abc", text2 = "def"', output: '0', explanation: 'There is no common subsequence.' },
    ],
    constraints: ['1 <= text1.length, text2.length <= 1000', 'text1 and text2 consist of only lowercase English characters.'],
    testCases: [
      { input: 'abcde\nace', expected: '3' },
      { input: 'abc\nabc', expected: '3' },
      { input: 'abc\ndef', expected: '0' },
    ],
    tags: ['Dynamic Programming', 'String'],
    starterCode: {
      javascript: 'function longestCommonSubsequence(text1, text2) {\n  // Your code here\n}',
      python: 'def longest_common_subsequence(text1, text2):\n    # Your code here\n    pass',
      java: 'class Solution {\n    public int longestCommonSubsequence(String text1, String text2) {\n        // Your code here\n        return 0;\n    }\n}',
      cpp: 'class Solution {\npublic:\n    int longestCommonSubsequence(string text1, string text2) {\n        // Your code here\n        return 0;\n    }\n};',
    },
  },
  {
    id: 'number-of-islands',
    title: 'Number of Islands',
    difficulty: 'Medium',
    category: 'Graphs',
    acceptance: 55.1,
    description: 'Given an `m x n` 2D binary grid `grid` which represents a map of \'1\'s (land) and \'0\'s (water), return the number of islands.\n\nAn island is surrounded by water and is formed by connecting adjacent lands horizontally or vertically. You may assume all four edges of the grid are all surrounded by water.',
    examples: [
      { input: 'grid = [\n  ["1","1","1","1","0"],\n  ["1","1","0","1","0"],\n  ["1","1","0","0","0"],\n  ["0","0","0","0","0"]\n]', output: '1', explanation: '' },
      { input: 'grid = [\n  ["1","1","0","0","0"],\n  ["1","1","0","0","0"],\n  ["0","0","1","0","0"],\n  ["0","0","0","1","1"]\n]', output: '3', explanation: '' },
    ],
    constraints: ['m == grid.length', 'n == grid[i].length', '1 <= m, n <= 300', 'grid[i][j] is \'0\' or \'1\'.'],
    testCases: [
      { input: '[["1","1","1","1","0"],["1","1","0","1","0"],["1","1","0","0","0"],["0","0","0","0","0"]]', expected: '1' },
      { input: '[["1","1","0","0","0"],["1","1","0","0","0"],["0","0","1","0","0"],["0","0","0","1","1"]]', expected: '3' },
    ],
    tags: ['Graph', 'DFS', 'BFS', 'Matrix'],
    starterCode: {
      javascript: 'function numIslands(grid) {\n  // Your code here\n}',
      python: 'def num_islands(grid):\n    # Your code here\n    pass',
      java: 'class Solution {\n    public int numIslands(char[][] grid) {\n        // Your code here\n        return 0;\n    }\n}',
      cpp: 'class Solution {\npublic:\n    int numIslands(vector<vector<char>>& grid) {\n        // Your code here\n        return 0;\n    }\n};',
    },
  },
  {
    id: 'container-with-most-water',
    title: 'Container With Most Water',
    difficulty: 'Medium',
    category: 'Arrays',
    acceptance: 54.3,
    description: 'You are given an integer array `height` of length `n`. There are `n` vertical lines drawn such that the two endpoints of the i-th line are `(i, 0)` and `(i, height[i])`.\n\nFind two lines that together with the x-axis form a container, such that the container contains the most water.\n\nReturn the maximum amount of water a container can store.',
    examples: [
      { input: 'height = [1,8,6,2,5,4,8,3,7]', output: '49', explanation: 'The max area of water the container can contain is 49.' },
      { input: 'height = [1,1]', output: '1', explanation: '' },
    ],
    constraints: ['n == height.length', '2 <= n <= 10^5', '0 <= height[i] <= 10^4'],
    testCases: [
      { input: '[1,8,6,2,5,4,8,3,7]', expected: '49' },
      { input: '[1,1]', expected: '1' },
    ],
    tags: ['Array', 'Two Pointers', 'Greedy'],
    starterCode: {
      javascript: 'function maxArea(height) {\n  // Your code here\n}',
      python: 'def max_area(height):\n    # Your code here\n    pass',
      java: 'class Solution {\n    public int maxArea(int[] height) {\n        // Your code here\n        return 0;\n    }\n}',
      cpp: 'class Solution {\npublic:\n    int maxArea(vector<int>& height) {\n        // Your code here\n        return 0;\n    }\n};',
    },
  },
  {
    id: 'longest-substring-no-repeat',
    title: 'Longest Substring Without Repeating Characters',
    difficulty: 'Medium',
    category: 'Strings',
    acceptance: 33.8,
    description: 'Given a string `s`, find the length of the longest substring without repeating characters.',
    examples: [
      { input: 's = "abcabcbb"', output: '3', explanation: 'The answer is "abc", with the length of 3.' },
      { input: 's = "bbbbb"', output: '1', explanation: 'The answer is "b", with the length of 1.' },
      { input: 's = "pwwkew"', output: '3', explanation: 'The answer is "wke", with the length of 3.' },
    ],
    constraints: ['0 <= s.length <= 5 * 10^4', 's consists of English letters, digits, symbols and spaces.'],
    testCases: [
      { input: 'abcabcbb', expected: '3' },
      { input: 'bbbbb', expected: '1' },
      { input: 'pwwkew', expected: '3' },
    ],
    tags: ['Hash Table', 'String', 'Sliding Window'],
    starterCode: {
      javascript: 'function lengthOfLongestSubstring(s) {\n  // Your code here\n}',
      python: 'def length_of_longest_substring(s):\n    # Your code here\n    pass',
      java: 'class Solution {\n    public int lengthOfLongestSubstring(String s) {\n        // Your code here\n        return 0;\n    }\n}',
      cpp: 'class Solution {\npublic:\n    int lengthOfLongestSubstring(string s) {\n        // Your code here\n        return 0;\n    }\n};',
    },
  },
  {
    id: 'validate-bst',
    title: 'Validate Binary Search Tree',
    difficulty: 'Medium',
    category: 'Trees',
    acceptance: 31.5,
    description: 'Given the `root` of a binary tree, determine if it is a valid binary search tree (BST).\n\nA valid BST is defined as follows:\n- The left subtree of a node contains only nodes with keys less than the node\'s key.\n- The right subtree of a node contains only nodes with keys greater than the node\'s key.\n- Both the left and right subtrees must also be binary search trees.',
    examples: [
      { input: 'root = [2,1,3]', output: 'true', explanation: '' },
      { input: 'root = [5,1,4,null,null,3,6]', output: 'false', explanation: 'The root node\'s value is 5 but its right child\'s value is 4.' },
    ],
    constraints: ['The number of nodes in the tree is in the range [1, 10^4].', '-2^31 <= Node.val <= 2^31 - 1'],
    testCases: [
      { input: '[2,1,3]', expected: 'true' },
      { input: '[5,1,4,null,null,3,6]', expected: 'false' },
    ],
    tags: ['Tree', 'DFS', 'BST'],
    starterCode: {
      javascript: 'function isValidBST(root) {\n  // Your code here\n}',
      python: 'def is_valid_bst(root):\n    # Your code here\n    pass',
      java: 'class Solution {\n    public boolean isValidBST(TreeNode root) {\n        // Your code here\n        return false;\n    }\n}',
      cpp: 'class Solution {\npublic:\n    bool isValidBST(TreeNode* root) {\n        // Your code here\n        return false;\n    }\n};',
    },
  },
  {
    id: 'course-schedule',
    title: 'Course Schedule',
    difficulty: 'Medium',
    category: 'Graphs',
    acceptance: 45.2,
    description: 'There are a total of `numCourses` courses you have to take, labeled from `0` to `numCourses - 1`. You are given an array `prerequisites` where `prerequisites[i] = [ai, bi]` indicates that you must take course `bi` first if you want to take course `ai`.\n\nReturn `true` if you can finish all courses. Otherwise, return `false`.',
    examples: [
      { input: 'numCourses = 2, prerequisites = [[1,0]]', output: 'true', explanation: 'There are 2 courses. To take course 1 you should have finished course 0. So it is possible.' },
      { input: 'numCourses = 2, prerequisites = [[1,0],[0,1]]', output: 'false', explanation: 'There are 2 courses. To take course 1 you need course 0, and to take course 0 you need course 1. Impossible.' },
    ],
    constraints: ['1 <= numCourses <= 2000', '0 <= prerequisites.length <= 5000', 'prerequisites[i].length == 2'],
    testCases: [
      { input: '2\n[[1,0]]', expected: 'true' },
      { input: '2\n[[1,0],[0,1]]', expected: 'false' },
    ],
    tags: ['Graph', 'Topological Sort', 'DFS', 'BFS'],
    starterCode: {
      javascript: 'function canFinish(numCourses, prerequisites) {\n  // Your code here\n}',
      python: 'def can_finish(num_courses, prerequisites):\n    # Your code here\n    pass',
      java: 'class Solution {\n    public boolean canFinish(int numCourses, int[][] prerequisites) {\n        // Your code here\n        return false;\n    }\n}',
      cpp: 'class Solution {\npublic:\n    bool canFinish(int numCourses, vector<vector<int>>& prerequisites) {\n        // Your code here\n        return false;\n    }\n};',
    },
  },
  {
    id: 'median-sorted-arrays',
    title: 'Median of Two Sorted Arrays',
    difficulty: 'Hard',
    category: 'Arrays',
    acceptance: 36.1,
    description: 'Given two sorted arrays `nums1` and `nums2` of size `m` and `n` respectively, return the median of the two sorted arrays.\n\nThe overall run time complexity should be O(log (m+n)).',
    examples: [
      { input: 'nums1 = [1,3], nums2 = [2]', output: '2.00000', explanation: 'merged array = [1,2,3] and median is 2.' },
      { input: 'nums1 = [1,2], nums2 = [3,4]', output: '2.50000', explanation: 'merged array = [1,2,3,4] and median is (2 + 3) / 2 = 2.5.' },
    ],
    constraints: ['nums1.length == m', 'nums2.length == n', '0 <= m <= 1000', '0 <= n <= 1000', '1 <= m + n <= 2000'],
    testCases: [
      { input: '[1,3]\n[2]', expected: '2.0' },
      { input: '[1,2]\n[3,4]', expected: '2.5' },
    ],
    tags: ['Array', 'Binary Search', 'Divide and Conquer'],
    starterCode: {
      javascript: 'function findMedianSortedArrays(nums1, nums2) {\n  // Your code here\n}',
      python: 'def find_median_sorted_arrays(nums1, nums2):\n    # Your code here\n    pass',
      java: 'class Solution {\n    public double findMedianSortedArrays(int[] nums1, int[] nums2) {\n        // Your code here\n        return 0.0;\n    }\n}',
      cpp: 'class Solution {\npublic:\n    double findMedianSortedArrays(vector<int>& nums1, vector<int>& nums2) {\n        // Your code here\n        return 0.0;\n    }\n};',
    },
  },
  {
    id: 'trapping-rain-water',
    title: 'Trapping Rain Water',
    difficulty: 'Hard',
    category: 'Arrays',
    acceptance: 58.7,
    description: 'Given `n` non-negative integers representing an elevation map where the width of each bar is 1, compute how much water it can trap after raining.',
    examples: [
      { input: 'height = [0,1,0,2,1,0,1,3,2,1,2,1]', output: '6', explanation: 'The elevation map can trap 6 units of rain water.' },
      { input: 'height = [4,2,0,3,2,5]', output: '9', explanation: '' },
    ],
    constraints: ['n == height.length', '1 <= n <= 2 * 10^4', '0 <= height[i] <= 10^5'],
    testCases: [
      { input: '[0,1,0,2,1,0,1,3,2,1,2,1]', expected: '6' },
      { input: '[4,2,0,3,2,5]', expected: '9' },
    ],
    tags: ['Array', 'Two Pointers', 'Stack', 'Dynamic Programming'],
    starterCode: {
      javascript: 'function trap(height) {\n  // Your code here\n}',
      python: 'def trap(height):\n    # Your code here\n    pass',
      java: 'class Solution {\n    public int trap(int[] height) {\n        // Your code here\n        return 0;\n    }\n}',
      cpp: 'class Solution {\npublic:\n    int trap(vector<int>& height) {\n        // Your code here\n        return 0;\n    }\n};',
    },
  },
  {
    id: 'select-employees',
    title: 'Select High-Salary Employees',
    difficulty: 'Easy',
    category: 'SQL',
    acceptance: 68.4,
    description: 'Write a SQL query to find all employees who earn more than the average salary.\n\nTable: `employees`\n| Column  | Type    |\n|---------|---------|\n| id      | int     |\n| name    | varchar |\n| salary  | int     |\n| dept_id | int     |',
    examples: [
      { input: 'employees table with salaries [50000, 60000, 70000, 80000]', output: 'Employees with salary > 65000 (the average)', explanation: '' },
    ],
    constraints: ['Table has at least 1 row.'],
    testCases: [
      { input: 'Standard employees table', expected: 'Rows where salary > AVG(salary)' },
    ],
    tags: ['SQL', 'Aggregation', 'Subquery'],
    starterCode: {
      javascript: '-- Write your SQL query here\nSELECT ',
      python: '-- Write your SQL query here\nSELECT ',
      java: '-- Write your SQL query here\nSELECT ',
      cpp: '-- Write your SQL query here\nSELECT ',
    },
  },
  {
    id: 'aptitude-percentage',
    title: 'Percentage Calculation',
    difficulty: 'Easy',
    category: 'Aptitude',
    acceptance: 82.1,
    description: 'Given a number and a percentage, calculate the result.\n\nWrite a function that takes a number `n` and a percentage `p`, and returns `p%` of `n`.',
    examples: [
      { input: 'n = 200, p = 15', output: '30', explanation: '15% of 200 = 30' },
      { input: 'n = 500, p = 20', output: '100', explanation: '20% of 500 = 100' },
    ],
    constraints: ['1 <= n <= 10^6', '0 <= p <= 100'],
    testCases: [
      { input: '200\n15', expected: '30' },
      { input: '500\n20', expected: '100' },
      { input: '1000\n7.5', expected: '75' },
    ],
    tags: ['Math', 'Aptitude'],
    starterCode: {
      javascript: 'function calculatePercentage(n, p) {\n  // Your code here\n}',
      python: 'def calculate_percentage(n, p):\n    # Your code here\n    pass',
      java: 'class Solution {\n    public double calculatePercentage(int n, double p) {\n        // Your code here\n        return 0;\n    }\n}',
      cpp: 'class Solution {\npublic:\n    double calculatePercentage(int n, double p) {\n        // Your code here\n        return 0;\n    }\n};',
    },
  },
];

// ── Fallback Assessments ────────────────────────────────────────────────────
const FALLBACK_ASSESSMENTS = [
  {
    id: 'ds-arrays-basics',
    title: 'Data Structures: Arrays Fundamentals',
    type: 'Topic Tests',
    duration: 20,
    questionCount: 10,
    difficulty: 'Easy',
    topics: ['Arrays', 'Indexing', 'Iteration'],
    questions: [
      { id: 'q1', type: 'mcq', text: 'What is the time complexity of accessing an element in an array by index?', options: ['O(1)', 'O(n)', 'O(log n)', 'O(n^2)'], correct: 'O(1)', explanation: 'Array access by index is constant time because arrays use contiguous memory.' },
      { id: 'q2', type: 'mcq', text: 'Which of the following is NOT a valid operation on an array?', options: ['Insert at index', 'Access by key name', 'Delete at index', 'Traverse all elements'], correct: 'Access by key name', explanation: 'Arrays use numeric indices, not key names. That is a feature of hash maps / dictionaries.' },
      { id: 'q3', type: 'true-false', text: 'Arrays in most languages have a fixed size once initialized.', correct: 'True', explanation: 'Static arrays have fixed sizes. Dynamic arrays (like ArrayList, vector) can resize but internally allocate new fixed-size blocks.' },
      { id: 'q4', type: 'mcq', text: 'What is the worst-case time complexity of inserting an element at the beginning of an array?', options: ['O(1)', 'O(log n)', 'O(n)', 'O(n log n)'], correct: 'O(n)', explanation: 'Inserting at the beginning requires shifting all existing elements one position to the right.' },
      { id: 'q5', type: 'mcq', text: 'Which data structure is best for LIFO (Last In First Out) operations?', options: ['Queue', 'Stack', 'Array', 'Linked List'], correct: 'Stack', explanation: 'A Stack follows LIFO order. While arrays can simulate stacks, a stack is the purpose-built structure.' },
      { id: 'q6', type: 'short-answer', text: 'What is the index of the last element in an array of size n?', correct: 'n-1', explanation: 'Arrays are 0-indexed in most languages, so the last element is at index n-1.' },
      { id: 'q7', type: 'mcq', text: 'What happens when you access an array index that is out of bounds in most compiled languages?', options: ['Returns null', 'Returns 0', 'Runtime error / exception', 'Returns undefined'], correct: 'Runtime error / exception', explanation: 'Out-of-bounds access typically causes an ArrayIndexOutOfBoundsException or segmentation fault.' },
      { id: 'q8', type: 'true-false', text: 'A 2D array is stored as an array of arrays in memory.', correct: 'True', explanation: 'In most languages, 2D arrays are implemented as arrays of arrays (row-major or column-major order).' },
      { id: 'q9', type: 'mcq', text: 'What is the space complexity of an array with n elements?', options: ['O(1)', 'O(n)', 'O(log n)', 'O(n^2)'], correct: 'O(n)', explanation: 'An array of n elements takes O(n) space.' },
      { id: 'q10', type: 'mcq', text: 'Which sorting algorithm is most efficient for nearly sorted arrays?', options: ['Quick Sort', 'Merge Sort', 'Insertion Sort', 'Selection Sort'], correct: 'Insertion Sort', explanation: 'Insertion sort runs in O(n) on nearly sorted arrays, making it the best choice for this case.' },
    ],
  },
  {
    id: 'algo-mock-exam-1',
    title: 'Algorithms Mock Exam #1',
    type: 'Mock Exams',
    duration: 45,
    questionCount: 15,
    difficulty: 'Medium',
    topics: ['Sorting', 'Searching', 'Recursion', 'Complexity'],
    questions: [
      { id: 'q1', type: 'mcq', text: 'What is the average time complexity of Quick Sort?', options: ['O(n)', 'O(n log n)', 'O(n^2)', 'O(log n)'], correct: 'O(n log n)', explanation: 'Quick Sort has an average-case time complexity of O(n log n) with good pivot selection.' },
      { id: 'q2', type: 'mcq', text: 'Which sorting algorithm is stable?', options: ['Quick Sort', 'Heap Sort', 'Merge Sort', 'Selection Sort'], correct: 'Merge Sort', explanation: 'Merge Sort preserves the relative order of equal elements, making it a stable sort.' },
      { id: 'q3', type: 'true-false', text: 'Binary search requires the array to be sorted.', correct: 'True', explanation: 'Binary search works by eliminating half the search space at each step, which requires sorted data.' },
      { id: 'q4', type: 'mcq', text: 'What is the recurrence relation for Merge Sort?', options: ['T(n) = T(n-1) + O(n)', 'T(n) = 2T(n/2) + O(n)', 'T(n) = T(n/2) + O(1)', 'T(n) = 2T(n-1) + O(1)'], correct: 'T(n) = 2T(n/2) + O(n)', explanation: 'Merge Sort divides the array in half (2T(n/2)) and merges in O(n) time.' },
      { id: 'q5', type: 'mcq', text: 'In a recursion, what is the condition that stops further recursive calls?', options: ['Loop condition', 'Base case', 'Recursive case', 'Exit condition'], correct: 'Base case', explanation: 'The base case is the condition that stops recursion and begins returning values.' },
      { id: 'q6', type: 'mcq', text: 'What is the space complexity of an iterative binary search?', options: ['O(n)', 'O(log n)', 'O(1)', 'O(n log n)'], correct: 'O(1)', explanation: 'Iterative binary search only uses a constant amount of extra variables.' },
      { id: 'q7', type: 'short-answer', text: 'How many comparisons does linear search need in the worst case for an array of n elements?', correct: 'n', explanation: 'Linear search checks every element, so worst case is n comparisons.' },
      { id: 'q8', type: 'mcq', text: 'Which algorithm uses a divide-and-conquer approach?', options: ['Bubble Sort', 'Insertion Sort', 'Merge Sort', 'Selection Sort'], correct: 'Merge Sort', explanation: 'Merge Sort divides the array into halves, sorts each half, and merges them back.' },
      { id: 'q9', type: 'true-false', text: 'O(n log n) is more efficient than O(n^2) for large n.', correct: 'True', explanation: 'As n grows, n log n grows much slower than n^2.' },
      { id: 'q10', type: 'mcq', text: 'What is tail recursion?', options: ['Recursion at the start of a function', 'Recursion where the recursive call is the last operation', 'Recursion with two base cases', 'Recursion that uses a stack'], correct: 'Recursion where the recursive call is the last operation', explanation: 'Tail recursion occurs when the recursive call is the final action, allowing compiler optimization.' },
      { id: 'q11', type: 'mcq', text: 'Which of these has O(1) amortized time for insertions?', options: ['Linked List at head', 'Dynamic Array at end', 'BST insertion', 'Hash Table (worst case)'], correct: 'Dynamic Array at end', explanation: 'Dynamic arrays (like ArrayList) have O(1) amortized insertion at the end, with occasional O(n) resizes.' },
      { id: 'q12', type: 'mcq', text: 'What does "in-place" sorting mean?', options: ['Sorting without a computer', 'Sorting using O(1) extra space', 'Sorting in ascending order', 'Sorting without comparisons'], correct: 'Sorting using O(1) extra space', explanation: 'In-place algorithms sort using only a constant amount of additional memory.' },
      { id: 'q13', type: 'true-false', text: 'Heap Sort has a worst-case time complexity of O(n log n).', correct: 'True', explanation: 'Heap Sort guarantees O(n log n) in all cases because heap operations take O(log n).' },
      { id: 'q14', type: 'mcq', text: 'What is the best-case time complexity of Bubble Sort?', options: ['O(n)', 'O(n log n)', 'O(n^2)', 'O(1)'], correct: 'O(n)', explanation: 'With an optimized version that detects no swaps, Bubble Sort runs in O(n) on already sorted arrays.' },
      { id: 'q15', type: 'short-answer', text: 'Name the sorting algorithm that repeatedly selects the minimum element from the unsorted portion.', correct: 'Selection Sort', explanation: 'Selection Sort works by finding the minimum element and placing it at the beginning of the unsorted portion.' },
    ],
  },
  {
    id: 'semester-cs-fundamentals',
    title: 'CS Fundamentals Semester Assessment',
    type: 'Semester Assessments',
    duration: 60,
    questionCount: 20,
    difficulty: 'Medium',
    topics: ['Data Structures', 'Algorithms', 'OOP', 'OS Basics'],
    questions: [
      { id: 'q1', type: 'mcq', text: 'Which data structure uses FIFO ordering?', options: ['Stack', 'Queue', 'Tree', 'Graph'], correct: 'Queue', explanation: 'Queue follows First In First Out (FIFO) ordering.' },
      { id: 'q2', type: 'mcq', text: 'What is encapsulation in OOP?', options: ['Inheriting properties', 'Hiding implementation details', 'Creating multiple forms', 'Dividing code into modules'], correct: 'Hiding implementation details', explanation: 'Encapsulation is the bundling of data and methods, restricting direct access to internal state.' },
      { id: 'q3', type: 'true-false', text: 'A linked list provides O(1) access to any element by index.', correct: 'False', explanation: 'Linked lists require traversal from the head, making random access O(n).' },
      { id: 'q4', type: 'mcq', text: 'Which traversal of a BST gives sorted output?', options: ['Pre-order', 'In-order', 'Post-order', 'Level-order'], correct: 'In-order', explanation: 'In-order traversal visits left, root, right which gives sorted output for a BST.' },
      { id: 'q5', type: 'mcq', text: 'What is a deadlock in operating systems?', options: ['A fast process', 'A circular wait among processes for resources', 'A memory leak', 'A CPU cache miss'], correct: 'A circular wait among processes for resources', explanation: 'Deadlock occurs when processes are stuck waiting for each other to release resources.' },
      { id: 'q6', type: 'mcq', text: 'Which OOP principle allows a child class to use methods of a parent class?', options: ['Polymorphism', 'Encapsulation', 'Inheritance', 'Abstraction'], correct: 'Inheritance', explanation: 'Inheritance enables a class to inherit methods and fields from a parent class.' },
      { id: 'q7', type: 'short-answer', text: 'What is the maximum number of children a node can have in a binary tree?', correct: '2', explanation: 'By definition, each node in a binary tree can have at most 2 children.' },
      { id: 'q8', type: 'mcq', text: 'What is the purpose of virtual memory?', options: ['Speed up CPU', 'Extend available memory using disk', 'Compress data', 'Cache network data'], correct: 'Extend available memory using disk', explanation: 'Virtual memory uses disk space to simulate additional RAM, allowing larger programs to run.' },
      { id: 'q9', type: 'true-false', text: 'A hash table guarantees O(1) lookup in all cases.', correct: 'False', explanation: 'Hash tables have O(1) average-case but O(n) worst-case due to collisions.' },
      { id: 'q10', type: 'mcq', text: 'Which of these is NOT a valid graph traversal?', options: ['BFS', 'DFS', 'In-order', 'Topological Sort'], correct: 'In-order', explanation: 'In-order traversal is specific to binary trees, not general graphs.' },
      { id: 'q11', type: 'mcq', text: 'What does the "abstract" keyword do in OOP?', options: ['Makes a class final', 'Prevents instantiation directly', 'Makes methods private', 'Enables multiple inheritance'], correct: 'Prevents instantiation directly', explanation: 'Abstract classes cannot be instantiated and are meant to be subclassed.' },
      { id: 'q12', type: 'mcq', text: 'Which scheduling algorithm may cause starvation?', options: ['Round Robin', 'FCFS', 'Shortest Job First', 'All of them'], correct: 'Shortest Job First', explanation: 'SJF can starve longer processes if shorter ones keep arriving.' },
      { id: 'q13', type: 'true-false', text: 'A complete binary tree can be efficiently stored in an array.', correct: 'True', explanation: 'Complete binary trees map naturally to arrays using index formulas for parent/child relationships.' },
      { id: 'q14', type: 'mcq', text: 'What is polymorphism?', options: ['One class inheriting from many', 'Same interface, different implementations', 'Hiding data', 'Creating objects'], correct: 'Same interface, different implementations', explanation: 'Polymorphism allows objects of different types to be treated through the same interface.' },
      { id: 'q15', type: 'mcq', text: 'What is a process in an operating system?', options: ['A stored file', 'A program in execution', 'A memory address', 'A CPU register'], correct: 'A program in execution', explanation: 'A process is an instance of a program that is being executed by the OS.' },
      { id: 'q16', type: 'short-answer', text: 'What is the time complexity of searching in a balanced BST?', correct: 'O(log n)', explanation: 'A balanced BST halves the search space at each step, giving O(log n) complexity.' },
      { id: 'q17', type: 'mcq', text: 'Which of these is a non-linear data structure?', options: ['Array', 'Stack', 'Queue', 'Tree'], correct: 'Tree', explanation: 'Trees are hierarchical and non-linear, unlike arrays, stacks, and queues.' },
      { id: 'q18', type: 'true-false', text: 'Threads share the same memory space within a process.', correct: 'True', explanation: 'Threads within a process share the same address space, including heap memory.' },
      { id: 'q19', type: 'mcq', text: 'What is the amortized time complexity of push operation in a dynamic array?', options: ['O(1)', 'O(n)', 'O(log n)', 'O(n^2)'], correct: 'O(1)', explanation: 'Although occasional resizing takes O(n), the amortized cost per push is O(1).' },
      { id: 'q20', type: 'mcq', text: 'What is method overloading?', options: ['Same name, different parameters', 'Same name, same parameters in child class', 'Private methods', 'Static methods'], correct: 'Same name, different parameters', explanation: 'Method overloading means defining multiple methods with the same name but different parameter lists.' },
    ],
  },
  {
    id: 'skill-javascript',
    title: 'JavaScript Proficiency Assessment',
    type: 'Skill Assessments',
    duration: 30,
    questionCount: 12,
    difficulty: 'Medium',
    topics: ['JavaScript', 'ES6+', 'Async', 'DOM'],
    questions: [
      { id: 'q1', type: 'mcq', text: 'What is the difference between `let` and `var`?', options: ['No difference', '`let` is block-scoped, `var` is function-scoped', '`var` is block-scoped, `let` is function-scoped', '`let` cannot be reassigned'], correct: '`let` is block-scoped, `var` is function-scoped', explanation: '`let` has block scope (curly braces), while `var` has function scope or global scope.' },
      { id: 'q2', type: 'mcq', text: 'What does `===` check in JavaScript?', options: ['Value only', 'Type only', 'Value and type', 'Reference'], correct: 'Value and type', explanation: 'Strict equality (===) checks both value and type without coercion.' },
      { id: 'q3', type: 'true-false', text: '`null == undefined` evaluates to true in JavaScript.', correct: 'True', explanation: 'With loose equality (==), null and undefined are considered equal.' },
      { id: 'q4', type: 'mcq', text: 'Which method creates a new array with the results of calling a function on every element?', options: ['forEach', 'map', 'filter', 'reduce'], correct: 'map', explanation: '`map` transforms each element and returns a new array. `forEach` does not return a new array.' },
      { id: 'q5', type: 'mcq', text: 'What is a closure in JavaScript?', options: ['A class definition', 'A function that has access to its outer scope variables', 'A way to close a browser window', 'A loop construct'], correct: 'A function that has access to its outer scope variables', explanation: 'A closure is a function bundled with references to its surrounding lexical scope.' },
      { id: 'q6', type: 'short-answer', text: 'What keyword is used to handle errors in async/await?', correct: 'try-catch', explanation: 'The try-catch block is used to handle errors with async/await.' },
      { id: 'q7', type: 'mcq', text: 'What does `Promise.all()` do?', options: ['Runs promises sequentially', 'Waits for all promises to resolve or any to reject', 'Returns the first resolved promise', 'Cancels all promises'], correct: 'Waits for all promises to resolve or any to reject', explanation: 'Promise.all waits for all promises and rejects immediately if any promise rejects.' },
      { id: 'q8', type: 'true-false', text: 'Arrow functions have their own `this` context.', correct: 'False', explanation: 'Arrow functions do not have their own `this`. They inherit `this` from the enclosing scope.' },
      { id: 'q9', type: 'mcq', text: 'What is event delegation?', options: ['Assigning events to every child', 'Using a parent element to handle events for children', 'Removing event listeners', 'Creating custom events'], correct: 'Using a parent element to handle events for children', explanation: 'Event delegation leverages event bubbling to handle events at a parent level, improving performance.' },
      { id: 'q10', type: 'mcq', text: 'What is the output of `typeof null`?', options: ['"null"', '"undefined"', '"object"', '"boolean"'], correct: '"object"', explanation: 'This is a well-known JavaScript bug. `typeof null` returns "object" due to legacy reasons.' },
      { id: 'q11', type: 'mcq', text: 'Which ES6 feature allows destructuring?', options: ['Spread operator', 'Destructuring assignment', 'Template literals', 'Default parameters'], correct: 'Destructuring assignment', explanation: 'Destructuring assignment allows extracting values from arrays or properties from objects.' },
      { id: 'q12', type: 'mcq', text: 'What does `Object.freeze()` do?', options: ['Deep clones an object', 'Prevents modifications to an object', 'Converts object to array', 'Deletes all properties'], correct: 'Prevents modifications to an object', explanation: 'Object.freeze() makes an object immutable (shallow freeze).' },
    ],
  },
  {
    id: 'skill-python-basics',
    title: 'Python Fundamentals Check',
    type: 'Skill Assessments',
    duration: 25,
    questionCount: 10,
    difficulty: 'Easy',
    topics: ['Python', 'Data Types', 'Control Flow', 'Functions'],
    questions: [
      { id: 'q1', type: 'mcq', text: 'Which of the following is an immutable data type in Python?', options: ['list', 'dict', 'set', 'tuple'], correct: 'tuple', explanation: 'Tuples are immutable sequences in Python. Lists, dicts, and sets are all mutable.' },
      { id: 'q2', type: 'true-false', text: 'Python uses indentation to define code blocks.', correct: 'True', explanation: 'Python uses whitespace indentation instead of curly braces to define scope and code blocks.' },
      { id: 'q3', type: 'mcq', text: 'What does `len()` return for the string "Hello"?', options: ['4', '5', '6', 'Error'], correct: '5', explanation: '"Hello" has 5 characters, so len("Hello") returns 5.' },
      { id: 'q4', type: 'mcq', text: 'Which keyword defines a function in Python?', options: ['function', 'func', 'def', 'lambda'], correct: 'def', explanation: 'The `def` keyword is used to define functions in Python. `lambda` creates anonymous functions.' },
      { id: 'q5', type: 'short-answer', text: 'What is the output of `type(3.14)` in Python?', correct: "float", explanation: '3.14 is a floating-point number, so type() returns <class \'float\'>.' },
      { id: 'q6', type: 'mcq', text: 'How do you create a list comprehension to double each number in a list?', options: ['[x*2 for x in list]', 'list.map(x => x*2)', 'double(list)', '{x*2 : x in list}'], correct: '[x*2 for x in list]', explanation: 'List comprehensions in Python use the syntax [expression for item in iterable].' },
      { id: 'q7', type: 'true-false', text: 'In Python, `//` performs integer (floor) division.', correct: 'True', explanation: 'The `//` operator performs floor division, returning the largest integer less than or equal to the result.' },
      { id: 'q8', type: 'mcq', text: 'What does `strip()` do to a string?', options: ['Removes vowels', 'Removes whitespace from both ends', 'Converts to lowercase', 'Splits into words'], correct: 'Removes whitespace from both ends', explanation: 'strip() removes leading and trailing whitespace characters from a string.' },
      { id: 'q9', type: 'mcq', text: 'Which statement correctly handles an exception in Python?', options: ['catch Exception:', 'try: ... except:', 'handle Error:', 'error: ... fix:'], correct: 'try: ... except:', explanation: 'Python uses try/except blocks for exception handling.' },
      { id: 'q10', type: 'mcq', text: 'What is a dictionary in Python?', options: ['Ordered sequence', 'Key-value pair collection', 'Immutable list', 'Set of unique elements'], correct: 'Key-value pair collection', explanation: 'Dictionaries store key-value pairs and provide fast lookup by key.' },
    ],
  },
];

// ── AI System Prompts ───────────────────────────────────────────────────────

const SYSTEM_PROMPT_RUN = `You are a code evaluator. Given a coding problem, test cases, and a user's code submission, evaluate whether the code would produce the correct output for each test case.

Return ONLY valid JSON:
{
  "results": [
    { "testCase": 1, "input": "...", "expected": "...", "actual": "...", "passed": true/false }
  ],
  "summary": "Brief summary of results"
}

Rules:
- Mentally trace the code execution for each test case
- Be accurate about what the code would actually produce
- If the code has syntax errors, mark all test cases as failed with the error as "actual"
- Keep the summary under 2 sentences`;

const SYSTEM_PROMPT_SUBMIT = `You are a code reviewer and evaluator. Given a coding problem and a user's solution, evaluate correctness, provide detailed feedback, and suggest improvements.

Return ONLY valid JSON:
{
  "passed": true/false,
  "results": [
    { "testCase": 1, "input": "...", "expected": "...", "actual": "...", "passed": true/false }
  ],
  "feedback": "Detailed feedback on the solution",
  "timeComplexity": "O(...)",
  "spaceComplexity": "O(...)",
  "suggestions": ["improvement1", "improvement2"]
}

Rules:
- Evaluate all test cases
- Provide constructive feedback
- Mention time and space complexity
- Suggest optimizations if applicable`;

const SYSTEM_PROMPT_HINT = `You are a coding tutor helping students learn to solve programming problems. Given a problem and a hint level, provide an appropriate hint.

Hint levels:
- Level 1: General approach / which technique to use (no code)
- Level 2: Pseudocode outline of the solution
- Level 3: Key insight or the critical trick needed

Return ONLY valid JSON:
{
  "hint": "Your hint text here",
  "level": 1/2/3
}

Rules:
- NEVER give the full solution
- Be encouraging and educational
- Match the hint detail to the requested level
- Use simple, clear language`;

// ── Hint fallback ───────────────────────────────────────────────────────────
function generateFallbackHint(problem, level) {
  const hints = {
    1: `Think about which data structure would help you solve "${problem.title}" efficiently. Consider the constraints and what operations you need to perform. A good starting point is to think about the time complexity you're aiming for.`,
    2: `Here's a general approach for "${problem.title}":\n1. Initialize your data structure\n2. Iterate through the input\n3. For each element, check if the condition is met\n4. Update your result accordingly\n5. Return the final answer`,
    3: `Key insight for "${problem.title}": The trick is to think about what information you need to track as you process each element. Often, using a hash map or two-pointer technique can reduce the complexity from O(n^2) to O(n).`,
  };
  return hints[level] || hints[1];
}

// ── Routes ──────────────────────────────────────────────────────────────────

// [1/10] GET /problems — list with filters
router.get('/problems', authenticateToken, requirePlan(1), async (c) => {
  try {
    const { category, difficulty, status, search, page = 1 } = getQuery(c);
    const userId = c.get('user').id;
    const perPage = 20;

    let problems = [...FALLBACK_PROBLEMS];

    // Apply filters
    if (category && category !== 'All') {
      problems = problems.filter(p => p.category === category);
    }
    if (difficulty && difficulty !== 'All') {
      problems = problems.filter(p => p.difficulty === difficulty);
    }
    if (search) {
      const q = search.toLowerCase();
      problems = problems.filter(p =>
        p.title.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        p.tags.some(t => t.toLowerCase().includes(q))
      );
    }

    // Fetch user submission statuses from DB
    let solvedMap = {};
    let attemptedMap = {};
    try {
      const solved = await getDb(c).query(
        'SELECT DISTINCT problem_id FROM practice_submissions WHERE user_id = $1 AND passed = true',
        [userId]
      );
      solved.rows.forEach(r => { solvedMap[r.problem_id] = true; });

      const attempted = await getDb(c).query(
        'SELECT DISTINCT problem_id FROM practice_submissions WHERE user_id = $1',
        [userId]
      );
      attempted.rows.forEach(r => {
        if (!solvedMap[r.problem_id]) attemptedMap[r.problem_id] = true;
      });
    } catch {
      // DB not available, continue without status
    }

    // Fetch bookmarks
    let bookmarks = {};
    try {
      const bk = await getDb(c).query(
        'SELECT problem_id FROM practice_bookmarks WHERE user_id = $1',
        [userId]
      );
      bk.rows.forEach(r => { bookmarks[r.problem_id] = true; });
    } catch {
      // continue
    }

    // Annotate problems with status
    problems = problems.map(p => ({
      id: p.id,
      title: p.title,
      difficulty: p.difficulty,
      category: p.category,
      acceptance: p.acceptance,
      tags: p.tags,
      status: solvedMap[p.id] ? 'Solved' : (attemptedMap[p.id] ? 'Attempted' : 'New'),
      bookmarked: !!bookmarks[p.id],
    }));

    // Filter by status
    if (status && status !== 'All') {
      problems = problems.filter(p => p.status === status);
    }

    // Paginate
    const total = problems.length;
    const start = (page - 1) * perPage;
    const paginated = problems.slice(start, start + perPage);

    return c.json({
      problems: paginated,
      total,
      page: Number(page),
      totalPages: Math.ceil(total / perPage),
    });
  } catch (err) {
    console.error('GET /problems error:', err.message);
    return c.json({ error: 'Failed to fetch problems' }, 500);
  }
});

// [2/10] GET /problems/:id — problem details
router.get('/problems/:id', authenticateToken, requirePlan(1), async (c) => {
  try {
    const problem = FALLBACK_PROBLEMS.find(p => p.id === c.req.param('id'));
    if (!problem) {
      return c.json({ error: 'Problem not found' }, 404);
    }

    // Check if bookmarked
    let bookmarked = false;
    try {
      const bk = await getDb(c).query(
        'SELECT id FROM practice_bookmarks WHERE user_id = $1 AND problem_id = $2',
        [c.get('user').id, problem.id]
      );
      bookmarked = bk.rows.length > 0;
    } catch {
      // continue
    }

    // Get user's previous submissions for this problem
    let previousSubmissions = [];
    try {
      const subs = await getDb(c).query(
        'SELECT id, language, passed, feedback, created_at FROM practice_submissions WHERE user_id = $1 AND problem_id = $2 ORDER BY created_at DESC LIMIT 5',
        [c.get('user').id, problem.id]
      );
      previousSubmissions = subs.rows;
    } catch {
      // continue
    }

    return c.json({
      ...problem,
      bookmarked,
      previousSubmissions,
    });
  } catch (err) {
    console.error('GET /problems/:id error:', err.message);
    return c.json({ error: 'Failed to fetch problem' }, 500);
  }
});

// [3/10] POST /problems/:id/run — run code against test cases
router.post('/problems/:id/run', authenticateToken, requirePlan(1), async (c) => {
  try {
    const problem = FALLBACK_PROBLEMS.find(p => p.id === c.req.param('id'));
    if (!problem) {
      return c.json({ error: 'Problem not found' }, 404);
    }

    const { code, language } = getBody(c);
    if (!code || !language) {
      return c.json({ error: 'Code and language are required' }, 400);
    }

    const userPrompt = `Problem: ${problem.title}
Description: ${problem.description}
Test Cases:
${problem.testCases.map((tc, i) => `Test ${i + 1}: Input: ${tc.input} | Expected: ${tc.expected}`).join('\n')}

User's Code (${language}):
${code}

Evaluate this code against the test cases.`;

    let results;
    try {
      const { aiClient } = getServices(c);
      const aiResponse = await aiClient.callAI({
        systemPrompt: SYSTEM_PROMPT_RUN,
        userPrompt,
        maxTokens: 800,
        temperature: 0.2,
        structuredJson: true,
      });
      results = aiClient.extractJSON(aiResponse);
    } catch {
      // Fallback results
      results = {
        results: problem.testCases.map((tc, i) => ({
          testCase: i + 1,
          input: tc.input,
          expected: tc.expected,
          actual: 'Unable to evaluate (AI unavailable)',
          passed: false,
        })),
        summary: 'AI evaluation is currently unavailable. Please try again later.',
      };
    }

    return c.json(results);
  } catch (err) {
    console.error('POST /problems/:id/run error:', err.message);
    return c.json({ error: 'Failed to run code' }, 500);
  }
});

// [4/10] POST /problems/:id/submit — submit solution
router.post('/problems/:id/submit', authenticateToken, requirePlan(1), async (c) => {
  try {
    const problem = FALLBACK_PROBLEMS.find(p => p.id === c.req.param('id'));
    if (!problem) {
      return c.json({ error: 'Problem not found' }, 404);
    }

    const { code, language } = getBody(c);
    if (!code || !language) {
      return c.json({ error: 'Code and language are required' }, 400);
    }

    const userPrompt = `Problem: ${problem.title}
Description: ${problem.description}
Constraints: ${problem.constraints.join(', ')}
Test Cases:
${problem.testCases.map((tc, i) => `Test ${i + 1}: Input: ${tc.input} | Expected: ${tc.expected}`).join('\n')}

User's Solution (${language}):
${code}

Evaluate this solution thoroughly.`;

    let evaluation;
    try {
      const { aiClient } = getServices(c);
      const aiResponse = await aiClient.callAI({
        systemPrompt: SYSTEM_PROMPT_SUBMIT,
        userPrompt,
        maxTokens: 1200,
        temperature: 0.3,
        structuredJson: true,
      });
      evaluation = aiClient.extractJSON(aiResponse);
    } catch {
      evaluation = {
        passed: false,
        results: problem.testCases.map((tc, i) => ({
          testCase: i + 1,
          input: tc.input,
          expected: tc.expected,
          actual: 'Unable to evaluate',
          passed: false,
        })),
        feedback: 'AI evaluation is currently unavailable. Your submission has been recorded.',
        timeComplexity: 'N/A',
        spaceComplexity: 'N/A',
        suggestions: ['Try again when AI evaluation is available.'],
      };
    }

    // Save submission to DB
    try {
      await getDb(c).query(
        'INSERT INTO practice_submissions (user_id, problem_id, code, language, passed, results, feedback) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [c.get('user').id, problem.id, code, language, evaluation.passed || false, JSON.stringify(evaluation.results), evaluation.feedback]
      );
    } catch (dbErr) {
      console.error('Failed to save submission:', dbErr.message);
    }

    return c.json(evaluation);
  } catch (err) {
    console.error('POST /problems/:id/submit error:', err.message);
    return c.json({ error: 'Failed to submit solution' }, 500);
  }
});

// [5/10] POST /problems/:id/hint — get AI hint
router.post('/problems/:id/hint', authenticateToken, requirePlan(1), async (c) => {
  try {
    const problem = FALLBACK_PROBLEMS.find(p => p.id === c.req.param('id'));
    if (!problem) {
      return c.json({ error: 'Problem not found' }, 404);
    }

    const { hintLevel = 1 } = getBody(c);
    const level = Math.min(Math.max(Number(hintLevel), 1), 3);

    const userPrompt = `Problem: ${problem.title}
Description: ${problem.description}
Category: ${problem.category}
Difficulty: ${problem.difficulty}
Tags: ${problem.tags.join(', ')}

Please provide a Level ${level} hint for this problem.`;

    let hintData;
    try {
      const { aiClient } = getServices(c);
      const aiResponse = await aiClient.callAI({
        systemPrompt: SYSTEM_PROMPT_HINT,
        userPrompt,
        maxTokens: 400,
        temperature: 0.5,
        structuredJson: true,
      });
      hintData = aiClient.extractJSON(aiResponse);
    } catch {
      hintData = {
        hint: generateFallbackHint(problem, level),
        level,
      };
    }

    return c.json(hintData);
  } catch (err) {
    console.error('POST /problems/:id/hint error:', err.message);
    return c.json({ error: 'Failed to get hint' }, 500);
  }
});

// [6/10] GET /assessments — list assessments
router.get('/assessments', authenticateToken, requirePlan(1), async (c) => {
  try {
    const userId = c.get('user').id;

    // Fetch user's best scores
    let scoresMap = {};
    try {
      const scores = await getDb(c).query(
        `SELECT assessment_id, MAX(score) as best_score, COUNT(*) as attempts
         FROM assessment_submissions WHERE user_id = $1
         GROUP BY assessment_id`,
        [userId]
      );
      scores.rows.forEach(r => {
        scoresMap[r.assessment_id] = {
          bestScore: Number(r.best_score),
          attempts: Number(r.attempts),
        };
      });
    } catch {
      // continue
    }

    const assessments = FALLBACK_ASSESSMENTS.map(a => ({
      id: a.id,
      title: a.title,
      type: a.type,
      duration: a.duration,
      questionCount: a.questionCount,
      difficulty: a.difficulty,
      topics: a.topics,
      bestScore: scoresMap[a.id]?.bestScore ?? null,
      attempts: scoresMap[a.id]?.attempts ?? 0,
    }));

    return c.json({ assessments });
  } catch (err) {
    console.error('GET /assessments error:', err.message);
    return c.json({ error: 'Failed to fetch assessments' }, 500);
  }
});

// [7/10] GET /assessments/:id — get assessment with questions
router.get('/assessments/:id', authenticateToken, requirePlan(1), async (c) => {
  try {
    const assessment = FALLBACK_ASSESSMENTS.find(a => a.id === c.req.param('id'));
    if (!assessment) {
      return c.json({ error: 'Assessment not found' }, 404);
    }

    // Return questions without correct answers for exam mode
    const mode = getQuery(c).mode || 'exam';
    const questions = assessment.questions.map(q => {
      const base = { id: q.id, type: q.type, text: q.text };
      if (q.options) base.options = q.options;
      if (mode === 'practice') {
        base.correct = q.correct;
        base.explanation = q.explanation;
      }
      return base;
    });

    return c.json({
      id: assessment.id,
      title: assessment.title,
      type: assessment.type,
      duration: assessment.duration,
      questionCount: assessment.questionCount,
      difficulty: assessment.difficulty,
      topics: assessment.topics,
      questions,
    });
  } catch (err) {
    console.error('GET /assessments/:id error:', err.message);
    return c.json({ error: 'Failed to fetch assessment' }, 500);
  }
});

// [8/10] POST /assessments/:id/submit — submit assessment
router.post('/assessments/:id/submit', authenticateToken, requirePlan(1), async (c) => {
  try {
    const assessment = FALLBACK_ASSESSMENTS.find(a => a.id === c.req.param('id'));
    if (!assessment) {
      return c.json({ error: 'Assessment not found' }, 404);
    }

    const { answers, timeTaken } = getBody(c);
    if (!answers || typeof answers !== 'object') {
      return c.json({ error: 'Answers are required' }, 400);
    }

    // Grade the assessment
    let correct = 0;
    const total = assessment.questions.length;
    const results = assessment.questions.map(q => {
      const userAnswer = answers[q.id] || '';
      // Normalize comparison
      const normalizedUser = String(userAnswer).trim().toLowerCase();
      const normalizedCorrect = String(q.correct).trim().toLowerCase();
      const isCorrect = normalizedUser === normalizedCorrect;
      if (isCorrect) correct++;
      return {
        questionId: q.id,
        text: q.text,
        type: q.type,
        userAnswer,
        correctAnswer: q.correct,
        isCorrect,
        explanation: q.explanation,
      };
    });

    const score = Math.round((correct / total) * 100);

    // Estimate percentile based on score
    let percentile;
    if (score >= 90) percentile = 95;
    else if (score >= 80) percentile = 85;
    else if (score >= 70) percentile = 70;
    else if (score >= 60) percentile = 55;
    else if (score >= 50) percentile = 40;
    else percentile = 25;

    // Save to DB
    try {
      await getDb(c).query(
        'INSERT INTO assessment_submissions (user_id, assessment_id, answers, score, total, time_taken, results) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [c.get('user').id, assessment.id, JSON.stringify(answers), score, total, timeTaken || null, JSON.stringify(results)]
      );
    } catch (dbErr) {
      console.error('Failed to save assessment submission:', dbErr.message);
    }

    return c.json({
      score,
      correct,
      total,
      percentile,
      timeTaken: timeTaken || null,
      results,
    });
  } catch (err) {
    console.error('POST /assessments/:id/submit error:', err.message);
    return c.json({ error: 'Failed to submit assessment' }, 500);
  }
});

// [9/10] GET /stats — user practice stats
router.get('/stats', authenticateToken, requirePlan(1), async (c) => {
  try {
    const userId = c.get('user').id;

    let stats = {
      totalSolved: 0,
      totalAttempted: 0,
      easySolved: 0,
      mediumSolved: 0,
      hardSolved: 0,
      streak: 0,
      assessmentsCompleted: 0,
      averageScore: 0,
      recentSubmissions: [],
      categoryBreakdown: {},
    };

    try {
      // Total solved
      const solved = await getDb(c).query(
        'SELECT DISTINCT problem_id FROM practice_submissions WHERE user_id = $1 AND passed = true',
        [userId]
      );
      stats.totalSolved = solved.rows.length;

      // Map solved problem IDs to difficulties
      const solvedIds = solved.rows.map(r => r.problem_id);
      solvedIds.forEach(id => {
        const prob = FALLBACK_PROBLEMS.find(p => p.id === id);
        if (prob) {
          if (prob.difficulty === 'Easy') stats.easySolved++;
          else if (prob.difficulty === 'Medium') stats.mediumSolved++;
          else if (prob.difficulty === 'Hard') stats.hardSolved++;
          stats.categoryBreakdown[prob.category] = (stats.categoryBreakdown[prob.category] || 0) + 1;
        }
      });

      // Total attempted
      const attempted = await getDb(c).query(
        'SELECT DISTINCT problem_id FROM practice_submissions WHERE user_id = $1',
        [userId]
      );
      stats.totalAttempted = attempted.rows.length;

      // Calculate streak (consecutive days with submissions)
      const days = await getDb(c).query(
        `SELECT DISTINCT DATE(created_at) as day FROM practice_submissions
         WHERE user_id = $1 ORDER BY day DESC LIMIT 30`,
        [userId]
      );
      let streak = 0;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      for (let i = 0; i < days.rows.length; i++) {
        const day = new Date(days.rows[i].day);
        day.setHours(0, 0, 0, 0);
        const diff = Math.round((today - day) / (1000 * 60 * 60 * 24));
        if (diff === i || diff === i + 1) {
          streak++;
        } else {
          break;
        }
      }
      stats.streak = streak;

      // Recent submissions
      const recent = await getDb(c).query(
        'SELECT problem_id, language, passed, created_at FROM practice_submissions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10',
        [userId]
      );
      stats.recentSubmissions = recent.rows.map(r => ({
        ...r,
        title: FALLBACK_PROBLEMS.find(p => p.id === r.problem_id)?.title || r.problem_id,
      }));

      // Assessment stats
      const assessmentStats = await getDb(c).query(
        'SELECT COUNT(DISTINCT assessment_id) as completed, AVG(score) as avg_score FROM assessment_submissions WHERE user_id = $1',
        [userId]
      );
      if (assessmentStats.rows[0]) {
        stats.assessmentsCompleted = Number(assessmentStats.rows[0].completed) || 0;
        stats.averageScore = Math.round(Number(assessmentStats.rows[0].avg_score) || 0);
      }
    } catch {
      // DB unavailable, return empty stats
    }

    return c.json(stats);
  } catch (err) {
    console.error('GET /stats error:', err.message);
    return c.json({ error: 'Failed to fetch stats' }, 500);
  }
});

// [10/10] POST /problems/:id/bookmark — toggle bookmark
router.post('/problems/:id/bookmark', authenticateToken, requirePlan(1), async (c) => {
  try {
    const problemId = c.req.param('id');
    const userId = c.get('user').id;

    const existing = await getDb(c).query(
      'SELECT id FROM practice_bookmarks WHERE user_id = $1 AND problem_id = $2',
      [userId, problemId]
    );

    if (existing.rows.length > 0) {
      await getDb(c).query('DELETE FROM practice_bookmarks WHERE user_id = $1 AND problem_id = $2', [userId, problemId]);
      return c.json({ bookmarked: false });
    } else {
      await getDb(c).query('INSERT INTO practice_bookmarks (user_id, problem_id) VALUES ($1, $2)', [userId, problemId]);
      return c.json({ bookmarked: true });
    }
  } catch (err) {
    console.error('POST /problems/:id/bookmark error:', err.message);
    return c.json({ error: 'Failed to toggle bookmark' }, 500);
  }
});

module.exports = router;
