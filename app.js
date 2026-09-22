async function runCode() {
    const code = document.getElementById("code").value;
    const output = document.getElementById("output");
    output.textContent = "Running...";
    try {
        const response = await fetch(
            "https://ce.judge0.com/submissions/?base64_encoded=false&wait=true",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    language_id: 54,
                    source_code: code,
                    stdin: ""
                })
            }
        );
        const result = await response.json();
        console.log(result);
        if (result.stdout) {
            output.textContent = result.stdout;
        } else if (result.compile_output) {
            output.textContent = result.compile_output;
        } else if (result.stderr) {
            output.textContent = result.stderr;
        } else {
            output.textContent = JSON.stringify(
                result,
                null,
                2
            );
        }
    } catch (error) {
        output.textContent = "ERROR: " + error;
    }
}