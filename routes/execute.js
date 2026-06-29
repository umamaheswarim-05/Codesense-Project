const express = require('express');
const router = express.Router();

function classifyError(stderr) {
  if (!stderr) return null;
  const lower = stderr.toLowerCase();
  if (lower.includes('syntaxerror') || lower.includes('syntax error') || lower.includes('error:')) return 'Syntax';
  if (lower.includes('nameerror') || lower.includes('typeerror') ||
      lower.includes('indexerror') || lower.includes('nullpointer') ||
      lower.includes('runtimeerror')) return 'Runtime';
  return 'Logic';
}

function getAIExplanation(errorMessage, language) {
  if (!errorMessage) return null;
  const lower = errorMessage.toLowerCase();
  if (lower.includes('nameerror') || lower.includes('is not defined')) {
    return `You have used a variable or function name that doesn't exist. Check for spelling mistakes and make sure the variable is defined before using it.`;
  }
  if (lower.includes('syntaxerror') || lower.includes('syntax error')) {
    return `Your code has a syntax error — the structure doesn't follow ${language} rules. Check for missing brackets, colons, or quotation marks.`;
  }
  if (lower.includes('typeerror')) {
    return `You are trying to perform an operation on the wrong data type. Use type conversion like str() or int() where needed.`;
  }
  if (lower.includes('indexerror')) {
    return `You are trying to access a position in a list that doesn't exist. Remember, list indexing starts at 0.`;
  }
  if (lower.includes('zerodivision')) {
    return `You are dividing a number by zero. Add a check to make sure the denominator is not zero before dividing.`;
  }
  if (lower.includes('nullpointer') || lower.includes('null')) {
    return `You are trying to use an object that hasn't been initialised. Make sure the object is created before calling methods on it.`;
  }
  if (lower.includes('indentationerror')) {
    return `Your code has an indentation error. Make sure all lines inside a function or loop are consistently indented.`;
  }
  if (lower.includes('error:') || lower.includes('exception')) {
    return `Your ${language} code has a compilation or runtime error. Check the line number mentioned in the error and fix the issue.`;
  }
  return `An error occurred in your ${language} code. Read the error message carefully — it tells you the line number and type of error.`;
}

module.exports = (pool) => {
  router.post('/run', async (req, res) => {
    try {
      const { code, language, userId } = req.body;

      if (!code || !language) {
        return res.status(400).json({ error: 'Code and language are required' });
      }

      const compilerMap = {
        python: 'cpython-3.13.8',
        javascript: 'nodejs-20.17.0',
        java: 'openjdk-jdk-22+36',
        cpp: 'gcc-13.2.0',
      };

      const compiler = compilerMap[language];
      if (!compiler) {
        return res.status(400).json({ error: 'Unsupported language' });
      }

      // Java: replace class name with prog to match file name
      let finalCode = code;
      if (language === 'java') {
        finalCode = code.replace(/public\s+class\s+\w+/g, 'public class prog');
      }

      const response = await fetch('https://wandbox.org/api/compile.json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          compiler: compiler,
          code: finalCode,
          options: '',
          stdin: '',
          'compiler-option-raw': '',
        }),
      });

      const result = await response.json();
      console.log('Wandbox result:', JSON.stringify(result));

      const stdout = result.program_output || '';
      const stderr = result.compiler_error || result.program_error || '';
      const isSuccess = result.status === '0';

      const execResult = await pool.query(
        `INSERT INTO executions (user_id, language, code, output, is_success)
         VALUES ($1, $2, $3, $4, $5) RETURNING exec_id`,
        [userId || null, language, code, isSuccess ? stdout : stderr, isSuccess]
      );

      const execId = execResult.rows[0].exec_id;
      let errorType = null;
      let aiExplanation = null;

      if (!isSuccess) {
        errorType = classifyError(stderr);
        aiExplanation = getAIExplanation(stderr, language);

        await pool.query(
          `INSERT INTO errors (exec_id, error_message, error_type, ai_explanation)
           VALUES ($1, $2, $3, $4)`,
          [execId, stderr, errorType, aiExplanation]
        );
      }

      res.json({
        success: isSuccess,
        output: isSuccess ? stdout || 'Code executed successfully' : null,
        error: isSuccess ? null : stderr,
        errorType,
        aiExplanation,
        execId,
      });

    } catch (err) {
      console.error('Execution error:', err.message);
      res.status(500).json({ error: 'Server error' });
    }
  });

  return router;
};