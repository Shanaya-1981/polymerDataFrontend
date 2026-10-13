# Testing setup on a fresh Mac

How to check the README's [Getting started](../README.md#getting-started) on a
Mac that has never seen this project: no Homebrew, no Node.js, no Claude Code,
no Rosetta. You run a second, clean copy of macOS inside a virtual machine (VM:
a simulated computer running in a window on your Mac), follow the README in it
as a new user would, then run the project's tests there. Steps 1–11 do that.
[Step 12](#12-on-your-own-mac) runs the same test on your own Mac, which is
quicker but can't show what a new user meets, since your Mac already has most
of what setup installs.

You need an Apple silicon Mac (M1 or newer) with about 60 GB of free disk space
and 16 GB of memory or more, a terminal, and a paid Claude plan for the login
step.

Everything below was run on 2026-10-13, against `main` at commit `89f755a`.

## Problems this test found

Each step below says where you'll run into these.

1. **On an Apple silicon Mac without Rosetta, PolymerData asks to install
   Rosetta** (Apple's translator for programs built for older, Intel-based
   Macs) instead of opening. PolymerData's program is a shell script, so macOS
   can't tell which kind of Mac it's for and assumes Intel. Adding
   `LSArchitecturePriority` (`arm64`, then `x86_64`) to
   `PolymerData.app/Contents/Info.plist` fixes it; this was tested in the VM.
   See [step 6](#6-readme-step-2-open-polymerdata-the-first-time).
2. **Setup can't run from the Downloads folder.** It stops at once with
   `setup.sh: Operation not permitted`. macOS protects Downloads (and Desktop
   and Documents; this run only tried Downloads) and lets an app in only if you
   allow it. It never asks here: it treats the access as `/bin/bash`'s, not
   PolymerData's, and doesn't ask on behalf of macOS's own programs. So the
   README's "choose **Allow**" question for the Downloads folder never appears.
   Moving the folder into the home folder works. See
   [step 7](#7-readme-step-3-let-it-set-itself-up).
3. **Setup always stops at "Installing MinerU" on a Mac that has never run
   MinerU.** `setup.sh` runs `mineru config set parse_server.local.mode
   managed`, which only works while MinerU's background server is running,
   and on a new Mac it isn't: the page shows `Error: Local mineru server is
   not running. Run 'mineru server start'.` Double-clicking PolymerData again
   stops at the same place. Adding `mineru server start` just before that line
   fixes it; this was tested in the VM. The README's
   [Setting it up by hand](../README.md#setting-it-up-by-hand) has the same
   order of commands. See [step 8](#8-the-rest-of-setup).
4. **Seen only in the VM: a first extraction can fail on a slow Mac.** The
   page said "The extraction failed" with `parse_wait_timeout: Parse did not
   finish within 720 seconds.` MinerU was still reading the paper. The VM is
   slower than any real Mac (its graphics chip is simulated, and it had 8 GB
   of memory), so this may never happen on real hardware, but an 8 GB Mac is
   worth trying. The message is also hard for a non-developer to act on. See
   [step 11](#11-readme-step-4-get-data-out-of-a-paper).

Smaller things a new user would notice:

- Safari asks "Do you want to allow downloads on "github.com"?" the first
  time. The README doesn't mention it ([step 5](#5-readme-step-1-download-it)).
- When setup stops for any reason, the page says to check the internet
  connection, even when that isn't the cause (problems 2 and 3).
- During "Installing MinerU", **Latest messages** shows "Warning: You are
  sending unauthenticated requests to the HF Hub. Please set a HF_TOKEN…". It's
  harmless (the model files download anyway) but reads like an error.
- The finished setup page's last message is "All set. Start the app with:
  ./start.sh", a terminal instruction, just below "From now on, double-click
  PolymerData to start it."
- Double-clicked again after setup stopped, PolymerData repeats the
  first-time text ("It downloads about 4 GB… It asks you two things"), though
  it carries on where it stopped.

## The tools

- **Tart** runs macOS VMs using Apple's Virtualization framework, the part of
  macOS that runs VMs. Apple's own open-source VM tool, `container`, only runs
  Linux, so it can't run the Mac app.
- **The VM image** is `ghcr.io/cirruslabs/macos-tahoe-vanilla`: plain macOS 26
  (Tahoe) with one user, `admin`, password `admin`, logged in automatically,
  and SSH (remote login from a terminal) turned on. "Vanilla" means nothing else
  is installed, which is close to what a new user's Mac looks like. Step 4
  undoes the few settings it changes.
- **Screen Sharing**, the Mac's built-in app for seeing and using another
  computer's screen, shows the VM. You click and type in it as on any Mac.

In the commands below, `vm '...'` runs a command in the VM; step 3 sets it up. Run them
all in one terminal, since step 1's `export PATH=...` lasts only for that terminal.

## 1. Get Tart

Download Tart's release from GitHub. Homebrew's `cirruslabs/cli/tart` formula
fails on current Homebrew with `Calling depends_on :macos with depends_on
macos: is disabled!`, so don't use it.

```sh
mkdir -p ~/vm-test && cd ~/vm-test
gh release download --repo cirruslabs/tart -p 'tart*'   # or download tart.tar.gz from github.com/cirruslabs/tart/releases
shasum -a 256 tart.tar.gz && cat tart_*_checksums.txt     # the two hashes must match
tar xzf tart.tar.gz
export PATH="$HOME/vm-test:$HOME/vm-test/tart.app/Contents/MacOS:$PATH"   # for tart, and for vm from step 3
tart --version                                           # tested with 2.40.1
```

## 2. Download macOS

```sh
tart pull ghcr.io/cirruslabs/macos-tahoe-vanilla:latest
```

It's 24 GB, so this takes a while. It prints nothing for long stretches. To
see it's still going, watch `du -sh ~/.tart/tmp` grow in another terminal.

## 3. Create and start the VM

```sh
tart clone ghcr.io/cirruslabs/macos-tahoe-vanilla:latest pd-test
tart set pd-test --cpu 4 --memory 8192 --display 1280x800
tart run pd-test --vnc-experimental > ~/vm-test/vm-run.log 2>&1 &
```

After about a minute, Screen Sharing opens on your Mac showing the VM's
desktop, with a Terminal window open. `tart ip pd-test` prints the VM's
address once it's up.

The VM has about 18 GB free, three times what the README asks for. Don't
bother making its disk bigger with `tart set --disk-size`: macOS's recovery
partition sits right after the main one, so the main one can't grow, and
macOS won't let you delete the recovery partition.

Set up `vm` so commands run in the VM without typing its password. `expect`,
which comes with macOS, types the password `admin` once:

```sh
ssh-keygen -q -t ed25519 -f ~/vm-test/vmkey -N ''
expect <<EOF
set timeout 60
spawn ssh-copy-id -i $HOME/vm-test/vmkey.pub -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null admin@$(tart ip pd-test)
expect { "assword:" { send "admin\r"; exp_continue } eof }
EOF
cat > ~/vm-test/vm <<'EOF'
#!/bin/bash
# Run a command in the test VM over SSH.
IP="$(~/vm-test/tart.app/Contents/MacOS/tart ip pd-test)"
exec ssh -i ~/vm-test/vmkey -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
  -o LogLevel=ERROR -o ConnectTimeout=10 admin@"$IP" "$@"
EOF
chmod +x ~/vm-test/vm
vm 'sw_vers -productVersion; command -v brew node claude uv'   # 26.6.2 in this run, and none of the four
```

## 4. Make it look like a new Mac

The image turns off Gatekeeper, the macOS check that stops apps from
unregistered developers. The Terminal window in the VM shows the command that
did it, `sudo spctl --global-disable`. With it off, step 6 would never show
the README's "Not Opened" message. Turn it back on:

```sh
vm 'echo admin | sudo -S -p "" spctl --global-enable; spctl --status'   # assessments enabled
```

That turns it on at its strictest setting, which only lets in apps from the
App Store. A new Mac also allows apps from known developers. In the VM, open
**System Settings**, choose **Privacy & Security**, scroll down to
**Security**, and set **Allow applications from** to **App Store & Known
Developers**. Enter the password `admin`. Without this, step 6 says "can't be
opened because it was not downloaded from the App Store" instead of what the
README describes. Check:

```sh
vm 'spctl --status --verbose'   # assessments enabled, developer id enabled
```

The image also turns on keyboard navigation (Tab moves between every button
in a dialog). Turn it off, and quit the VM's Terminal and System Settings:

```sh
vm 'defaults delete NSGlobalDomain AppleKeyboardUIMode
    osascript -e "tell application \"Terminal\" to quit" -e "tell application \"System Settings\" to quit"'
```

Don't install Rosetta in the VM. Many new Macs don't have it, and without it
the test also catches anything setup downloads that only runs on Intel Macs.
To check it's not there:

```sh
vm '/usr/bin/arch -x86_64 /usr/bin/true'   # Bad CPU type in executable
```

If macOS in the VM asks whether `sshd-keygen-wrapper` may control the Finder
or another app, choose **Don't Allow**. That's the `vm` command, not
PolymerData.

## 5. README step 1: Download it

In the VM, open Safari and go to https://github.com/merlinymy/polymerData.
Choose the green **Code** button, then **Download ZIP**.

Safari asks "Do you want to allow downloads on "github.com"?" Choose
**Allow**. The README doesn't mention this question.

Safari unzips the download by itself into `~/Downloads/polymerData-main` and
deletes the ZIP, so you never see `polymerData-main.zip`. The README allows for
this ("if your browser hasn't already"). Check that the folder is marked as
downloaded from the internet, and that Gatekeeper will stop the app:

```sh
vm 'xattr -p com.apple.quarantine ~/Downloads/polymerData-main/PolymerData.app
    spctl --assess -vv ~/Downloads/polymerData-main/PolymerData.app'
```

The first line ends `;Safari;` and a long ID. The second says `rejected` and
`source=no usable signature`.

## 6. README step 2: Open PolymerData the first time

In the Finder, open **Downloads**, then `polymerData-main`, and double-click
**PolymerData**.

**Problem 1:** a dialog says "To open "PolymerData", you need to install
Rosetta. Do you want to install it now?". Choose **Not Now**. Until
`PolymerData.app/Contents/Info.plist` on GitHub has the fix, make it in the
VM's copy so the rest of the test can go on without Rosetta:

```sh
vm 'P=~/Downloads/polymerData-main/PolymerData.app
    plutil -insert LSArchitecturePriority -json "[\"arm64\",\"x86_64\"]" $P/Contents/Info.plist
    /System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f $P'
```

The second command makes macOS reread the app's `Info.plist`; otherwise it
remembers the Rosetta answer.

Double-click **PolymerData** again. Now it goes as the README says:

1. A dialog says "“PolymerData” Not Opened", with **Move to Trash** and
   **Done**. **Move to Trash** is the highlighted button, so pressing Return
   deletes the app. Choose **Done**.
2. Open **System Settings**, choose **Privacy & Security** and scroll down to
   **Security**. It says "“PolymerData” was blocked to protect your Mac."
   Choose **Open Anyway**. A dialog asks again, with **Move to Trash**,
   **Open Anyway** and **Done**: choose **Open Anyway**. Enter the password
   `admin` and choose **OK**.

PolymerData asks: "PolymerData needs to set itself up first. It downloads
about 4 GB, and takes 10–30 minutes…", with **Cancel** and **Set Up**.

macOS ran PolymerData from a temporary copy ("App Translocation"), and
PolymerData found its real folder without asking you to choose it. To see
that:

```sh
vm 'pgrep -fl PolymerData'   # a path with /AppTranslocation/ in it
```

## 7. README step 3: Let it set itself up

Before you start, note the VM's free disk space, to measure what setup uses:

```sh
vm 'df -k / | tail -1'
```

Choose **Set Up**.

**Problem 2:** run from Downloads, setup stops at once. Safari shows
"Setup stopped", with `bash: /Users/admin/Downloads/polymerData-main/setup.sh:
Operation not permitted` under **Latest messages**, and a dialog says "Setup
stopped. The setup page in your browser says why." No question about the
Downloads folder appears at any point. To see macOS refusing:

```sh
vm 'echo admin | sudo -S -p "" log show --last 10m --style compact | grep "deny(1) file-read-data"'
# kernel ... System Policy: bash(...) deny(1) file-read-data /Users/admin/Downloads/polymerData-main/setup.sh
vm 'echo admin | sudo -S -p "" log show --last 10m --style compact --process tccd | grep "Platform binary prompting"'
# ... Platform binary prompting is 'Deny' because: is Platform Binary
```

The first line is the refusal. The second is why macOS didn't ask: it treats
the request as coming from `/bin/bash`, which is part of macOS itself, and it
never asks on behalf of macOS's own programs.

Work around it the way README step 1.3 suggests: choose **OK**, then in the
Finder drag `polymerData-main` from **Downloads** onto your home folder (`admin`
in the Finder's sidebar). Open it there and double-click **PolymerData**.
macOS doesn't ask about Gatekeeper again. Choose **Set Up**.

Now setup runs. The page in Safari ticks off each step:

1. **Checking Node.js:** downloads Node.js 24 into `.runtime/node`.
2. **Choosing where to keep your data:** a dialog suggests
   `/Users/admin/PolymerData Results`. Choose **Use This Folder**. To check:

   ```sh
   vm 'grep DATA_DIR ~/polymerData-main/extraction/.env; ls -d ~/"PolymerData Results"'
   # DATA_DIR='/Users/admin/PolymerData Results'
   ```
3. **Checking uv, the tool that installs MinerU and Python:** installs uv.
4. **Checking Claude Code and your Claude login:** installs Claude Code
   (2.1.296 in this run). A dialog says "PolymerData reads papers with
   Claude…". Choose **Log In**. Safari opens a Claude login page in a new tab.
   Log in with a paid Claude account. The tab then says "You're all set up for
   Claude Code. You can now close this window." Go back to the **Setting up
   PolymerData** tab, as the README says.

## 8. The rest of setup

Setup goes on by itself after the login:

5. **Installing the extraction server's Python packages,** then
6. **Installing the frontend's packages** (537 packages, a few seconds), then
7. **Installing MinerU, which turns a PDF into text and figure images:**
   installs MinerU (4.0.12 in this run) and downloads its model files.

**Problem 3:** after "Downloaded models for tier standard." the page says
"Setup stopped" with `Error: Local mineru server is not running. Run 'mineru
server start'.` To see that it's the `config` command that needs the server:

```sh
vm 'export PATH="$HOME/.local/bin:$PATH"
    mineru server status --json | grep "\"running\""   # "running": false
    mineru config get parse_server.local.mode'          # Error: Local mineru server is not running...
```

Until `setup.sh` on GitHub has the fix, make it in the VM's copy: choose **OK**,
then

```sh
vm 'cd ~/polymerData-main && perl -0pi -e "s/^(  mineru config set parse_server)/  mineru server start\n\$1/m" setup.sh
    grep -n -A2 "mineru server start" setup.sh'
```

Double-click **PolymerData** again and choose **Set Up**. It skips what's
done, and this time the MinerU step ends with "MinerU is ready.". Then:

8. **Asking Claude a test question:** the messages say "Claude says: ready".

The page says "PolymerData is set up", and the app opens in a new Safari tab
at `http://localhost:5173`, showing the dataset's numbers (655 samples, 65
source papers). Check both servers and the disk space setup used:

```sh
vm 'for u in http://localhost:5173 http://127.0.0.1:8000/docs http://127.0.0.1:5173; do
      printf "%s -> " $u; curl -s -o /dev/null -w "%{http_code}\n" --max-time 3 $u; done
    df -k / | tail -1'
```

The first two answer `200`. The third prints `000`: nothing answers at
`127.0.0.1:5173`, as the README's [What you'll notice](../README.md#what-youll-notice)
says. Compare the free space with step 7's: this run used about 5.7 GB, in
line with the README's "about 6 GB".

## 9. Run the project's tests in the VM

These use the Python and Node.js that setup installed, so they check that
setup put together a working environment, not just that the code is right.

```sh
vm 'cd ~/polymerData-main/extraction && .venv/bin/python -m unittest discover -s tests -t .'
vm 'export PATH="$HOME/polymerData-main/.runtime/node/bin:$PATH"; cd ~/polymerData-main/frontend
    npx vitest run && npm run -s typecheck && npm run -s lint && npm run -s build && rm -rf dist'
```

In this run (Python 3.12.15 and Node.js 24.21.0, both installed by setup), all
34 Python tests and all 603 frontend tests in 59 files passed, and typecheck,
lint and build were clean: the same as on a developer's Mac. The build warns
that some files are larger than 500 kB; that's a warning, not a failure.

The frontend's browser smoke test (`npm run smoke`) needs Google Chrome, which
a new Mac doesn't have, so check the pages in Safari instead (step 10).

## 10. Check every page in Safari

Open each of these in the VM's Safari. Each should show its heading and
content, and the chart pages a drawn chart, not a blank area:

| Page | Address | What it showed in this run |
|---|---|---|
| Home | `http://localhost:5173/` | 655 samples, 65 source papers, 78 polymers |
| Explore | `/explore` | "655 of 655 rows selected", a scatter plot |
| Temperature | `/temperature` | "619 series · 5,225 points", a line chart |
| Correlations | `/correlations` | a colored matrix of the 36 features |
| Data | `/data` | "Showing 1–25 of 655 rows.", a table |
| Discover | `/discover` | the Keywords form |
| Features | `/features` | "Showing 36 of 36 features." |
| About | `/about` | project background and funding |

Quitting Safari doesn't stop PolymerData: `http://localhost:5173` still
answers afterwards, as the README says.

## 11. README step 4: Get data out of a paper

Put a paper in the VM's Downloads folder, from your Mac's terminal:

```sh
scp -i ~/vm-test/vmkey -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
  path/to/paper.pdf admin@$(tart ip pd-test):Downloads/
```

This run used `papers/balke1973.pdf` (10 pages, 1.5 MB). In Safari, choose
**Extract** in the menu, then **Choose PDF**, and pick the paper in
Downloads. Under **Features**, type `Temperature (°C), Conductivity (S/cm)`.
The grey text already in the box is only an example; **Extract data** stays
greyed out until you type your own. Each feature appears as a chip under the
box. Choose **Extract data**.

The page shows "Extracting data… this may take a few minutes", a timer, a
progress bar and the current step: first "Parsing the PDF… A paper the server
hasn't seen before takes about 4 minutes."

The VM is much slower than a real Mac here. With 4 cores and 8 GB of memory,
MinerU's slowest stage ("Two Step Extraction", a vision model run over each
part of the page) ran for more than 10 minutes, and the VM was using nearly
3 GB of swap (disk space macOS uses when memory runs out). If your Mac has
24 GB or more, giving the VM 12 GB in step 3 (`--memory 12288`) may help;
this run didn't try it.

**Problem 4:** after 21 minutes the page said "The extraction failed" with
`parse_wait_timeout: Parse did not finish within 720 seconds.`, and **Try
again** and **Change file or features** buttons. MinerU kept working on the
paper in the background even after the extraction gave up on it.

To test the rest of the extraction anyway, give the VM the parse your own Mac
made of the same paper. The server reuses a parse when it finds one under the
paper's id, which comes from the PDF's contents (`fcac8200` for
`balke1973.pdf`). Your Mac has one if you've extracted the paper from your
checkout (in `extraction/output/parsed/`) or done step 12 (in its data
folder's `parsed/`). From the folder that holds it:

```sh
tar czf - fcac8200 |
  vm 'mkdir -p ~/"PolymerData Results"/parsed && cd ~/"PolymerData Results"/parsed && tar xzf -'
```

Choose **Try again**. This time the server log says "Reusing the saved parse",
and the page answers in about 10 seconds: "0 samples · 0 data points" and "No
samples found". That's the right answer: `balke1973.pdf` is about making PMMA,
not about conductivity.

Choose **New extraction**. The page keeps the features but not the PDF, so
choose the PDF again, and replace the features with `Time (min), Cov Exp`
(time and conversion, the measurements in the paper's Tables IV–XI). Choose
**Extract data**. In this run it took 45 seconds and found 8 samples with 202
data points, the number of rows in those tables:

```sh
vm 'grep -a "Extracted" ~/polymerData-main/extraction/logs/extraction.log | tail -1'
# ... Extracted 8 sample(s), 202 data point(s)
```

Every extraction counts against your Claude plan's usage limits, like a long
chat.

To stop the VM when you're done (its disk is kept, so `tart run` picks up
where it left off): `tart stop pd-test`. To delete it: `tart delete pd-test`.

## 12. On your own Mac

This takes minutes, not hours, and needs no VM. But your Mac already has most
of what setup installs (Node.js, Claude Code and its login, MinerU and its
model files), so setup skips those steps. It tests that the package works next
to an existing setup, not what a new user meets. In particular, it won't show
problem 1 if your Mac has Rosetta, or problem 3 if MinerU is already running,
and step 2 below avoids problem 2 on purpose.

1. **Free PolymerData's two web addresses.** If something already answers on
   port 5173 or 8000, such as an extraction server you started from your
   checkout, PolymerData says "Something on this Mac is already using
   PolymerData's web addresses" and doesn't start. To see what's there:

   ```sh
   lsof -nP -iTCP:5173 -sTCP:LISTEN; lsof -nP -iTCP:8000 -sTCP:LISTEN
   ```

   Stop it, and note how you started it so you can start it again afterwards.

2. **Download and unzip the package** into a folder of its own, outside
   Downloads, Desktop and Documents (problem 2), with an empty `data` folder
   next to it for the test's results:

   ```sh
   mkdir -p ~/projects/packageTest/data && cd ~/projects/packageTest
   curl -fsSL -o polymerData-main.zip https://github.com/merlinymy/polymerData/archive/refs/heads/main.zip
   xattr -w com.apple.quarantine "0083;$(printf %x $(date +%s));Safari;$(uuidgen)" polymerData-main.zip
   ditto -x -k polymerData-main.zip . && rm polymerData-main.zip
   spctl --assess -vv polymerData-main/PolymerData.app   # rejected, source=no usable signature
   ```

   This is the same ZIP as GitHub's **Code → Download ZIP**. The `xattr` line
   gives it the "downloaded from the internet" mark a browser adds, and `ditto`
   passes the mark on to every file it unzips. Without it, `curl`'s download
   has no mark, macOS opens PolymerData without the "Not Opened" message, and
   you don't test README step 2.

3. **Follow README steps 2 and 3** in the Finder: double-click PolymerData,
   then **Done**, **Open Anyway** twice in Privacy & Security, your password,
   **Set Up**. The "Not Opened" message reads "Apple could not verify
   “PolymerData” is free of malware that may harm your Mac or compromise your
   privacy." That's expected for an app that isn't signed by a registered
   developer.

   When setup asks where to keep your data, choose **Choose Another…** and
   pick `packageTest/data`. **Use This Folder** would use
   `~/PolymerData Results`, where any extractions you've made with PolymerData
   before are kept, and the test's results would mix with them. The steps
   below find the results through `DATA`:

   ```sh
   DATA=~/projects/packageTest/data
   ```

   In this run setup took 36 seconds. It used the Node.js 24 from Homebrew,
   found Claude Code installed and logged in (so it didn't ask), and found
   MinerU running with its model files (so it downloaded nothing). This run
   chose **Use This Folder**, which put the data in `~/PolymerData Results`.
   The app opened at `http://localhost:5173`.

4. **Run the tests in the package's copy,** with the Python setup installed:

   ```sh
   cd ~/projects/packageTest/polymerData-main/extraction && .venv/bin/python -m unittest discover -s tests -t .
   cd ../frontend && npx vitest run && npm run -s typecheck && npm run -s lint
   npm run smoke   # needs Google Chrome
   ```

   `npm run smoke` loads every page in Chrome at desktop and phone size and
   checks each one shows its content. In this run: 34 Python tests and 603
   frontend tests passed, typecheck and lint were clean, and the smoke test
   said "All routes rendered cleanly."

5. **Run an extraction through the extraction server,** from your checkout's
   root. Steps 5 and 6 use the paper this run used: S. T. Balke and A. E.
   Hamielec, "Bulk Polymerization of Methyl Methacrylate", *Journal of Applied
   Polymer Science* 17, 905–949 (1973). It isn't in the repo, since it isn't
   ours to publish; get it from a library and save it as
   `papers/balke1973.pdf`. With another paper, use features it reports and
   skip step 6, which only knows this paper's tables.

   ```sh
   job=$(curl -s -F "pdf=@papers/balke1973.pdf" -F "features=Time (min), Cov Exp" \
     http://127.0.0.1:8000/extract | python3 -c 'import json,sys; print(json.load(sys.stdin)["job"])')
   curl -s http://127.0.0.1:8000/extract/$job   # repeat until "status" is no longer "running"
   ```

   In this run it took 76 seconds and found 8 samples with 202 data points.
   The server saves the result as `$DATA/extractions/<job>.json`, and MinerU's
   reading of the paper as `$DATA/parsed/fcac8200/` (`fcac8200` is the
   paper's id, made from the PDF's contents). MinerU took only 14 seconds
   because it had read this paper on this Mac before; it keeps its own copy of
   every paper it reads, in `~/.mineru`.

6. **Score it against the paper's printed tables,** with the scorer from the
   `save-extraction-results` branch. It reads the tables from
   `output/parsed/fcac8200/content.md`, three folders up from its own
   location. Point that at `$DATA`, so the tables come from the same run as
   the extraction:

   ```sh
   D=/tmp/score/extraction/experiments/claude_code/pmma_xp; mkdir -p $D
   git show origin/save-extraction-results:extraction/experiments/claude_code/pmma_xp/score_runs.py > $D/score_runs.py
   ln -sfn "$DATA" /tmp/score/extraction/output
   python3 $D/score_runs.py "$DATA/extractions/$job.json"
   ```

   It first prints "Answer key: 202 rows in 8 tables"; fewer means the parse
   it found isn't of this paper. In this run: "exactly a table row (right
   condition, time and conversion): 202 of 202 rows", with nothing wrong or
   missed.

7. **Clean up.** Double-click PolymerData and choose **Stop PolymerData**. That
   also stops MinerU's background server, which your checkout shares; the
   extraction server starts it again the next time it needs it. Start again
   whatever you stopped in step 1. Then delete `~/projects/packageTest`: it
   holds the package and, if you chose `packageTest/data` in step 3, all of
   the test's results.

   If you chose **Use This Folder** instead, don't delete
   `~/PolymerData Results`, which may hold your real extractions. Delete only
   this test's result, `extractions/<job>.json`, and `parsed/fcac8200` only
   if it wasn't there before the test.

## Appendix: driving the VM's screen from a terminal

To script the clicks instead of making them in Screen Sharing, use
vncdotool, a program that clicks, types and takes screenshots over VNC (the
protocol Screen Sharing uses). Screen positions are in the VM's pixels: with
`--display 1280x800`, the screen is 2560 × 1600.

```sh
grep -o 'vnc://[^.]*\.[0-9.]*:[0-9]*' ~/vm-test/vm-run.log > ~/vm-test/vnc-url
python3 -m venv ~/vm-test/vncenv
~/vm-test/vncenv/bin/pip install vncdotool pillow
mkdir -p ~/vm-test/shots
cat > ~/vm-test/vnc.py <<'EOF'
"""Drive the VM's screen: vnc.py shot NAME | click X Y | dclick X Y | type TEXT | key KEY | drag X1 Y1 X2 Y2 | sleep SECONDS
Commands chain: vnc.py click 100 200 sleep 1 shot after"""
import sys, time, os
from vncdotool import api
S = os.path.dirname(os.path.abspath(__file__))
url = open(os.path.join(S, "vnc-url")).read().strip()   # vnc://:PASS@HOST:PORT
cred, hostport = url[len("vnc://"):].rsplit("@", 1)
host, port = hostport.rsplit(":", 1)
c = api.connect(f"{host}::{port}", password=cred.split(":", 1)[1])
a = sys.argv[1:]
i = 0
while i < len(a):
    cmd = a[i]
    if cmd == "shot":
        c.refreshScreen(); c.captureScreen(os.path.join(S, "shots", a[i+1] + ".png")); i += 2
    elif cmd in ("click", "dclick"):
        x, y = int(a[i+1]), int(a[i+2]); c.mouseMove(x, y); time.sleep(0.2)
        c.mousePress(1)
        if cmd == "dclick": time.sleep(0.1); c.mousePress(1)
        i += 3
    elif cmd == "type":
        for ch in a[i+1]: c.keyPress(ch); time.sleep(0.03)
        i += 2
    elif cmd == "key":
        c.keyPress(a[i+1]); i += 2
    elif cmd == "drag":   # drag X1 Y1 X2 Y2: hold the button from one point to another
        x1, y1, x2, y2 = map(int, a[i+1:i+5]); c.mouseMove(x1, y1); c.mouseDown(1)
        c.mouseDrag(x2, y2, step=20); c.mouseUp(1); i += 5
    elif cmd == "sleep":
        time.sleep(float(a[i+1])); i += 2
    else:
        sys.exit(f"unknown command {cmd}")
c.disconnect()
EOF
~/vm-test/vncenv/bin/python ~/vm-test/vnc.py shot desktop   # saves ~/vm-test/shots/desktop.png
```

The VM's VNC server ignores the scroll wheel. To scroll, drag the scroll bar
with `drag`. Dragging a Finder item onto the sidebar needs a slower drag than
`drag` makes: press, move in about 30 small steps with a short pause between
them, then release.

`type` loses the Shift key: "(" arrives as "9", ")" as "0" and capitals as
lowercase letters, and Command shortcuts such as Command-V don't work. To
enter text with any of those, put it on the VM's clipboard and paste it with
the menu: `vm 'printf "%s" "Time (min), Cov Exp" | pbcopy'`, click the text
box, then choose **Edit → Paste** in the VM's menu bar. Typing in Screen
Sharing with your own keyboard doesn't have this problem.

In the file chooser, typing `/` opens a "Go to" box and loses the characters
typed while it opens. Type the whole path again in that box, then press
Return twice: once to go to the file, once to choose it.
