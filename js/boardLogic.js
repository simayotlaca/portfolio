// Zero-Allocation Board Logic ported from C#
// This guarantees deterministic shuffle, zero garbage allocation per frame, 
// and perfectly mirrors the C# structure using TypedArrays.

class BoardLogic {
    constructor(rows, columns, colorCount) {
        this.rows = Math.max(2, rows);
        this.columns = Math.max(2, columns);
        this.colorCount = Math.max(1, Math.min(6, colorCount));
        this.minGroupSize = 2;

        this.cellCount = this.rows * this.columns;

        // Typed Arrays for zero-alloc
        this.grid = new Int32Array(this.cellCount);
        this.groupSizes = new Int32Array(this.cellCount);
        this.groupRoot = new Int32Array(this.cellCount);
        this.visited = new Int32Array(this.cellCount);
        this.queue = new Int32Array(this.cellCount);
        this.groupBuffer = new Int32Array(this.cellCount);
        this.colorBag = new Int32Array(this.cellCount);

        const shuffleTempSize = Math.max(this.cellCount, this.colorCount * 2) + this.cellCount;
        this.shuffleTemp = new Int32Array(shuffleTempSize);

        this.dirtyColumns = new Uint8Array(this.columns);
        this.colorCounts = new Int32Array(this.colorCount);

        this.colorQueue = new Int32Array(this.colorCount);
        for (let i = 0; i < this.colorCount; i++) this.colorQueue[i] = i;

        // Shuffle initial color queue
        for (let i = this.colorCount - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const temp = this.colorQueue[i];
            this.colorQueue[i] = this.colorQueue[j];
            this.colorQueue[j] = temp;
        }

        this.visitId = 1;
        this.aliveCount = 0;

        for (let i = 0; i < this.cellCount; i++) {
            this.grid[i] = -1;
            this.groupSizes[i] = 0;
            this.groupRoot[i] = -1;
            this.visited[i] = 0;
        }

        this.consecutiveDeadlocks = 0;
        this.shuffleSeed = 0;
        this.refillCounter = 0;
        this.lastRefillNeededShuffle = false;

        this.dirRows = new Int32Array([1, -1, 0, 0]);
        this.dirCols = new Int32Array([0, 0, 1, -1]);
    }

    clampAliveCount() {
        if (this.aliveCount < 0) this.aliveCount = 0;
        if (this.aliveCount > this.cellCount) this.aliveCount = this.cellCount;
    }

    idx(r, c) {
        return r * this.columns + c;
    }

    getRow(idx) {
        return Math.floor(idx / this.columns);
    }

    getCol(idx) {
        return idx % this.columns;
    }

    inBounds(r, c) {
        return (r >= 0 && r < this.rows && c >= 0 && c < this.columns);
    }

    fillBoard() {
        for (let i = 0; i < this.cellCount; i++) {
            this.grid[i] = Math.floor(Math.random() * this.colorCount);
        }
        this.aliveCount = this.cellCount;

        this.markAllColumnsDirty();
        let hasValidMove = this.recomputeGroupsAndCheckMove();

        if (!hasValidMove) {
            if (this.guaranteeMoveBySwapsOnly()) {
                this.recomputeGroupsAndCheckMove();
            } else {
                this.deterministicPermutation();
                if (!this.recomputeGroupsAndCheckMove()) {
                    this.guaranteeMoveBySwapsOnly();
                    this.recomputeGroupsAndCheckMove();
                }
            }
        }
        this.consecutiveDeadlocks = 0;
    }

    deterministicPermutation() {
        let alive = 0;
        for (let i = 0; i < this.cellCount; i++) {
            if (this.grid[i] !== -1) {
                this.queue[alive] = i;
                this.colorBag[alive] = this.grid[i];
                alive++;
            }
        }

        if (alive < 2) return;

        this.shuffleSeed++;
        let offset = (this.shuffleSeed * 7) % alive;
        if (offset === 0) offset = 1;

        for (let i = 0; i < alive; i++) {
            this.shuffleTemp[i] = this.colorBag[(i + offset) % alive];
        }

        for (let i = 0; i < alive; i++) {
            let pos = this.queue[i];
            this.grid[pos] = this.shuffleTemp[i];
        }

        this.markAllColumnsDirty();
    }

    guaranteeMoveBySwapsOnly() {
        for (let i = 0; i < this.colorCount; i++) this.colorCounts[i] = 0;

        let alive = 0;
        for (let i = 0; i < this.cellCount; i++) {
            if (this.grid[i] !== -1) {
                let clr = this.grid[i];
                if (clr >= 0 && clr < this.colorCount) this.colorCounts[clr]++;
                alive++;
            }
        }

        if (alive < 2) return false;

        for (let chosenColor = 0; chosenColor < this.colorCount; chosenColor++) {
            if (this.colorCounts[chosenColor] < 2) continue;

            if (this.tryGuaranteeWithColor(chosenColor)) {
                this.markAllColumnsDirty();
                return true;
            }
        }
        return false;
    }

    tryGuaranteeWithColor(chosenColor) {
        let sameColorCount = 0;
        for (let i = 0; i < this.cellCount; i++) {
            if (this.grid[i] === chosenColor) {
                this.queue[sameColorCount++] = i;
            }
        }

        if (sameColorCount < 2) return false;

        for (let i = 0; i < sameColorCount; i++) {
            let posA = this.queue[i];
            let rA = this.getRow(posA);
            let cA = this.getCol(posA);

            if (this.inBounds(rA + 1, cA) && this.grid[this.idx(rA + 1, cA)] === chosenColor) return true;
            if (this.inBounds(rA - 1, cA) && this.grid[this.idx(rA - 1, cA)] === chosenColor) return true;
            if (this.inBounds(rA, cA + 1) && this.grid[this.idx(rA, cA + 1)] === chosenColor) return true;
            if (this.inBounds(rA, cA - 1) && this.grid[this.idx(rA, cA - 1)] === chosenColor) return true;
        }

        let posBlockA = -1;
        let posBlockB = -1;
        let neighborIdx = -1;

        for (let i = 0; i < sameColorCount; i++) {
            let candidateA = this.queue[i];
            let rA = this.getRow(candidateA);
            let cA = this.getCol(candidateA);

            let foundNeighbor = this.findValidNeighbor(rA, cA, chosenColor);
            if (foundNeighbor !== -1) {
                posBlockA = candidateA;
                neighborIdx = foundNeighbor;
                for (let j = 0; j < sameColorCount; j++) {
                    if (this.queue[j] !== posBlockA) {
                        posBlockB = this.queue[j];
                        break;
                    }
                }
                break;
            }
        }

        if (posBlockA === -1 || posBlockB === -1 || neighborIdx === -1) return false;

        this.swapGridIndices(posBlockB, neighborIdx);
        return true;
    }

    findValidNeighbor(row, col, excludeColor) {
        for (let d = 0; d < 4; d++) {
            let nr = row + this.dirRows[d];
            let nc = col + this.dirCols[d];
            if (!this.inBounds(nr, nc)) continue;
            let nIdx = this.idx(nr, nc);
            if (this.grid[nIdx] !== -1 && this.grid[nIdx] !== excludeColor) return nIdx;
        }
        return -1;
    }

    swapGridIndices(a, b) {
        let tmp = this.grid[a];
        this.grid[a] = this.grid[b];
        this.grid[b] = tmp;

        this.markColumnDirty(this.getCol(a));
        this.markColumnDirty(this.getCol(b));
    }

    shuffleBoard() {
        this.applyGravityAll();

        if (this.aliveCount < this.minGroupSize) return false;

        if (this.recomputeGroupsAndCheckMove()) {
            this.consecutiveDeadlocks = 0;
            return true;
        }

        this.consecutiveDeadlocks++;

        if (this.guaranteeMoveBySwapsOnly()) {
            this.recomputeGroupsAndCheckMove();
            this.consecutiveDeadlocks = 0;
            return true;
        }

        this.deterministicPermutation();

        if (this.recomputeGroupsAndCheckMove()) {
            this.consecutiveDeadlocks = 0;
            return true;
        }

        if (this.guaranteeMoveBySwapsOnly()) {
            this.recomputeGroupsAndCheckMove();
            this.consecutiveDeadlocks = 0;
            return true;
        }

        this.consecutiveDeadlocks = 0;
        return false;
    }

    hardResetDeterministic() {
        for (let i = 0; i < this.cellCount; i++) {
            let r = this.getRow(i);
            let c = this.getCol(i);
            this.grid[i] = (r + c * 3 + this.shuffleSeed) % this.colorCount;
        }
        this.shuffleSeed++;
        this.aliveCount = this.cellCount;
        this.markAllColumnsDirty();

        if (!this.recomputeGroupsAndCheckMove()) {
            if (this.guaranteeMoveBySwapsOnly()) {
                this.recomputeGroupsAndCheckMove();
            } else {
                this.deterministicPermutation();
                if (!this.recomputeGroupsAndCheckMove()) {
                    this.guaranteeMoveBySwapsOnly();
                    this.recomputeGroupsAndCheckMove();
                }
            }
        }
        this.consecutiveDeadlocks = 0;
    }

    ensureValidMoveExists() {
        if (this.recomputeGroupsAndCheckMove()) {
            this.lastRefillNeededShuffle = false;
            return "None";
        }
        if (this.shuffleBoard()) {
            this.lastRefillNeededShuffle = false;
            return "ShuffleBoard";
        }
        this.hardResetDeterministic();
        this.lastRefillNeededShuffle = false;
        return "BoardReset";
    }

    refillEmptyCells() {
        this.lastRefillNeededShuffle = false;
        this.refillCounter++;
        this.rotateColorQueueDeterministic();

        let totalSpawned = 0;
        let spawnedInfo = [];

        for (let c = 0; c < this.columns; c++) {
            let spawnCountInCol = 0;
            let colOffset = (c * 7 + this.refillCounter * 3) % this.colorCount;

            for (let r = 0; r < this.rows; r++) {
                let i = this.idx(r, c);
                if (this.grid[i] !== -1) continue;

                let colorIdx = (spawnCountInCol + colOffset) % this.colorCount;
                let chosenColor = this.colorQueue[colorIdx];

                this.grid[i] = chosenColor;
                this.markColumnDirty(c);

                spawnedInfo.push({ row: r, col: c, color: chosenColor });

                spawnCountInCol++;
                totalSpawned++;
            }
        }

        this.aliveCount += totalSpawned;
        this.clampAliveCount();

        let hasMove = this.recomputeGroupsAndCheckMove();
        this.lastRefillNeededShuffle = !hasMove;

        return spawnedInfo;
    }

    rotateColorQueueDeterministic() {
        if (this.colorCount <= 1) return;

        let rotateBy = ((this.refillCounter * 3) + (this.shuffleSeed * 5)) % this.colorCount;
        if (rotateBy === 0) rotateBy = 1;

        for (let i = 0; i < this.colorCount; i++) {
            this.shuffleTemp[i] = this.colorQueue[(i + rotateBy) % this.colorCount];
        }
        for (let i = 0; i < this.colorCount; i++) {
            this.colorQueue[i] = this.shuffleTemp[i];
        }

        if (this.colorCount >= 2) {
            let swapA = this.refillCounter % this.colorCount;
            let swapB = (this.refillCounter + 1) % this.colorCount;
            if (swapA !== swapB) {
                let tmp = this.colorQueue[swapA];
                this.colorQueue[swapA] = this.colorQueue[swapB];
                this.colorQueue[swapB] = tmp;
            }
        }
    }

    isEmpty(r, c) {
        if (!this.inBounds(r, c)) return true;
        return this.grid[this.idx(r, c)] === -1;
    }

    getColor(r, c) {
        if (!this.inBounds(r, c)) return -1;
        return this.grid[this.idx(r, c)];
    }

    getGroupSize(r, c) {
        if (!this.inBounds(r, c)) return 0;
        return this.groupSizes[this.idx(r, c)];
    }

    // High performance group retrieval returning flat array of [r, c, ...] pairs for animation
    getGroupMembers(r, c) {
        if (!this.inBounds(r, c)) return [];
        let i = this.idx(r, c);
        if (this.grid[i] === -1 || this.groupSizes[i] < this.minGroupSize) return [];

        let root = this.groupRoot[i];
        let members = [];
        for (let idx = 0; idx < this.cellCount; idx++) {
            if (this.groupRoot[idx] === root && this.grid[idx] !== -1) {
                members.push(this.getRow(idx), this.getCol(idx));
            }
        }
        return members; // Format: [r1, c1, r2, c2, ...]
    }

    setEmpty(r, c) {
        if (!this.inBounds(r, c)) return;
        let i = this.idx(r, c);
        let wasAlive = (this.grid[i] !== -1);
        this.grid[i] = -1;
        this.groupSizes[i] = 0;
        this.groupRoot[i] = -1;
        if (wasAlive) this.aliveCount--;
        this.markColumnDirty(c);
    }

    markColumnDirty(c) {
        if (c >= 0 && c < this.columns) this.dirtyColumns[c] = 1;
    }

    markAllColumnsDirty() {
        for (let c = 0; c < this.columns; c++) this.dirtyColumns[c] = 1;
    }

    hasDirtyColumns() {
        for (let c = 0; c < this.columns; c++) {
            if (this.dirtyColumns[c]) return true;
        }
        return false;
    }

    clearDirtyFlags() {
        for (let c = 0; c < this.columns; c++) this.dirtyColumns[c] = 0;
    }

    expandDirtyToNeighbors() {
        let dirtyCount = 0;
        for (let c = 0; c < this.columns; c++) {
            if (this.dirtyColumns[c]) this.groupBuffer[dirtyCount++] = c;
        }
        for (let i = 0; i < dirtyCount; i++) {
            let c = this.groupBuffer[i];
            if (c > 0) this.dirtyColumns[c - 1] = 1;
            if (c < this.columns - 1) this.dirtyColumns[c + 1] = 1;
        }
    }

    recomputeGroupsAndCheckMove() {
        let hasDirty = this.hasDirtyColumns();

        if (!hasDirty) {
            for (let i = 0; i < this.cellCount; i++) {
                if (this.groupSizes[i] >= this.minGroupSize) return true;
            }
            return false;
        }

        this.expandDirtyToNeighbors();

        for (let c = 0; c < this.columns; c++) {
            if (!this.dirtyColumns[c]) continue;
            for (let r = 0; r < this.rows; r++) {
                let idx = this.idx(r, c);
                this.groupSizes[idx] = 0;
                this.groupRoot[idx] = -1;
            }
        }

        this.visitId++;
        if (this.visitId > 2000000000) {
            for (let i = 0; i < this.cellCount; i++) this.visited[i] = 0;
            this.visitId = 1;
        }

        let hasValidMove = false;

        for (let c = 0; c < this.columns; c++) {
            if (!this.dirtyColumns[c]) continue;
            for (let r = 0; r < this.rows; r++) {
                let i = this.idx(r, c);
                let color = this.grid[i];
                if (color === -1) continue;
                if (this.visited[i] === this.visitId) continue;

                let groupCount = this.floodFillBFS(i, color);

                let root = this.groupBuffer[0];
                for (let k = 1; k < groupCount; k++) {
                    if (this.groupBuffer[k] < root) root = this.groupBuffer[k];
                }

                for (let k = 0; k < groupCount; k++) {
                    let cell = this.groupBuffer[k];
                    this.groupSizes[cell] = groupCount;
                    this.groupRoot[cell] = root;
                }

                if (!hasValidMove && groupCount >= this.minGroupSize) {
                    hasValidMove = true;
                }
            }
        }

        this.clearDirtyFlags();
        return hasValidMove;
    }

    floodFillBFS(startIdx, targetColor) {
        let head = 0;
        let tail = 0;
        let groupCount = 0;

        this.queue[tail++] = startIdx;
        this.visited[startIdx] = this.visitId;

        while (head < tail) {
            let idx = this.queue[head++];
            this.groupBuffer[groupCount++] = idx;

            let r = this.getRow(idx);
            let c = this.getCol(idx);

            this.tryEnqueueNeighbor(r + 1, c, targetColor, tail); tail = this.queueTail;
            this.tryEnqueueNeighbor(r - 1, c, targetColor, tail); tail = this.queueTail;
            this.tryEnqueueNeighbor(r, c + 1, targetColor, tail); tail = this.queueTail;
            this.tryEnqueueNeighbor(r, c - 1, targetColor, tail); tail = this.queueTail;
        }

        return groupCount;
    }

    tryEnqueueNeighbor(r, c, targetColor, tail) {
        this.queueTail = tail;
        if (!this.inBounds(r, c)) return;

        let idx = this.idx(r, c);
        if (this.visited[idx] === this.visitId) return;
        if (this.grid[idx] !== targetColor) return;

        this.visited[idx] = this.visitId;
        this.queue[this.queueTail++] = idx;
    }

    removeGroupAt(r, c) {
        let removedOut = [];
        if (!this.inBounds(r, c)) return removedOut;

        let idx = this.idx(r, c);
        let color = this.grid[idx];
        if (color === -1) return removedOut;
        if (this.groupSizes[idx] < this.minGroupSize) return removedOut;

        this.visitId++;
        let groupCount = this.floodFillBFS(idx, color);
        if (groupCount < this.minGroupSize) return removedOut;

        for (let k = 0; k < groupCount; k++) {
            let gi = this.groupBuffer[k];
            let gc = this.getCol(gi);
            removedOut.push({ row: this.getRow(gi), col: gc });

            this.grid[gi] = -1;
            this.groupSizes[gi] = 0;
            this.groupRoot[gi] = -1;
            this.markColumnDirty(gc);
        }

        this.aliveCount -= groupCount;
        this.clampAliveCount();

        return removedOut;
    }

    applyGravityAll() {
        let moves = [];
        for (let c = 0; c < this.columns; c++) {
            let writeRow = 0;
            let moved = false;

            for (let r = 0; r < this.rows; r++) {
                let idx = this.idx(r, c);
                let color = this.grid[idx];
                if (color === -1) continue;

                if (writeRow !== r) {
                    this.grid[this.idx(writeRow, c)] = color;
                    this.grid[idx] = -1;
                    moved = true;
                    moves.push({ fromR: r, toR: writeRow, c: c, color: color });
                }
                writeRow++;
            }

            if (moved) {
                this.markColumnDirty(c);
                if (c > 0) this.markColumnDirty(c - 1);
                if (c < this.columns - 1) this.markColumnDirty(c + 1);
            }
        }
        return moves;
    }
}
