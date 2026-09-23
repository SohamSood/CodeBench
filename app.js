async function runCode() {
    const code = document.getElementById("codeEditor").value;
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
            console.log("OUTPUT:", result.stdout);
        } else if (result.compile_output) {
            console.log("COMPILE ERROR:", result.compile_output);
        } else if (result.stderr) {
            console.log("RUNTIME ERROR:", result.stderr);
        } else {
            console.log("UNKNOWN ERROR:", result);
        }
    } catch (error) {
        console.error("ERROR:", error);
    }
}
document.getElementById("runBtn").addEventListener("click", runCode);