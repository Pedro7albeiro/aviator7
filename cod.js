document.addEventListener('DOMContentLoaded', () => {
    const chartContainer = document.getElementById('chart-container');
    const svg = d3.select("#chart");
    const buttons = document.getElementById('buttons');
    const undoButton = document.getElementById('undo');
    const resetButton = document.getElementById('reset');
    const chartViewSelector = document.getElementById('chart-view-selector');

    const clockDiv = document.createElement('div');
    clockDiv.id = 'clock';
    clockDiv.style.textAlign = 'left';
    clockDiv.style.fontSize = '0.8em';
    clockDiv.style.color = '#c9d1d9';
    clockDiv.style.position = 'absolute';
    clockDiv.style.top = '10px';
    clockDiv.style.left = '10px';
    chartContainer.style.position = 'relative';
    chartContainer.appendChild(clockDiv);

    function updateClock() {
        const now = new Date();
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        clockDiv.textContent = `${hours}:${minutes}:${seconds}`;
    }
    updateClock();
    setInterval(updateClock, 1000);

    let width = chartContainer.offsetWidth;
    let height = chartContainer.offsetHeight;
    let margin = { top: 20, right: 70, bottom: 30, left: 40 };
    let innerWidth = width - margin.left - margin.right;
    let innerHeight = height - margin.top - margin.bottom;

    let data = [];
    let accumulatedValue = 0;
    let candles = [];
    let supports = [];
    let resistances = [];

    const xScale = d3.scaleLinear().range([margin.left, width - margin.right - 70]);
    const yScale = d3.scaleLinear().range([height - margin.bottom, margin.top]);

    const maxDataPoints = 24;
    let currentZoomLevel = 0;

    const emaFastPeriod = 5;
    const emaSlowPeriod = 10;

    let emaFast = [];
    let emaSlow = [];

    let fibonacciState = 'inactive';
    let fibonacciPoints = [];
    let fibonacciAnchorY = { y1_100: null, y2_0: null };

    const fibLevels = [
        { level: 0.0, label: '0.0%' },
        { level: 0.236, label: '23.6%' },
        { level: 0.382, label: '38.2%' },
        { level: 0.5, label: '50.0%' },
        { level: 0.618, label: '61.8%' },
        { level: 0.786, label: '78.6%' },
        { level: 1.0, label: '100.0%' }
    ];

    const fibonacciGroup = svg.select('.fibonacci-group');

    function clearFibonacci() {
        fibonacciGroup.selectAll("*").remove();
        fibonacciPoints = [];
        fibonacciAnchorY = { y1_100: null, y2_0: null };
        fibonacciState = 'inactive';
        svg.on('click', null);
        svg.style('cursor', 'default');
    }

    function drawFibonacciLevels(y1_100, y2_0) {
        fibonacciGroup.selectAll("*").remove();

        fibonacciAnchorY = { y1_100: y1_100, y2_0: y2_0 };

        const fibLineData = fibLevels.map(d => {
            const levelY = y2_0 + (y1_100 - y2_0) * d.level;
            return {
                ...d,
                y: levelY,
                isAnchor: d.level === 0.0 || d.level === 1.0
            };
        });

        const level50 = fibLineData.find(d => d.level === 0.5);
        const level618 = fibLineData.find(d => d.level === 0.618);

        if (level50 && level618) {
            const bandTopY = Math.min(level50.y, level618.y);
            const bandHeight = Math.abs(level50.y - level618.y);

            fibonacciGroup.append("rect")
                .attr("class", "golden-zone-band")
                .attr("x", margin.left)
                .attr("y", bandTopY)
                .attr("width", width - margin.right - 70)
                .attr("height", bandHeight);
        }

        fibonacciGroup.selectAll(".fibonacci-anchor-line")
            .data(fibLineData.filter(d => d.isAnchor))
            .enter().append("line")
            .attr("class", "fibonacci-anchor-line")
            .attr("x1", margin.left)
            .attr("x2", width - margin.right - 70)
            .attr("y1", d => d.y)
            .attr("y2", d => d.y)
            .call(d3.drag()
                .on("start", (event, d) => {
                    d3.select(event.subject).attr("stroke", "cyan").attr("stroke-width", 2);
                })
                .on("drag", (event, d) => {
                    const newY = Math.max(margin.top, Math.min(height - margin.bottom, event.y));

                    if (d.level === 1.0) {
                        fibonacciAnchorY.y1_100 = newY;
                    } else if (d.level === 0.0) {
                        fibonacciAnchorY.y2_0 = newY;
                    }

                    const currentY100 = fibonacciAnchorY.y1_100;
                    const currentY0 = fibonacciAnchorY.y2_0;

                    const updatedLineData = fibLevels.map(f => {
                        const levelY = currentY0 + (currentY100 - currentY0) * f.level;
                        return { ...f, y: levelY, isAnchor: f.level === 0.0 || f.level === 1.0 };
                    });

                    fibonacciGroup.selectAll(".fibonacci-anchor-line")
                        .data(updatedLineData.filter(d => d.isAnchor))
                        .attr("y1", f => f.y)
                        .attr("y2", f => f.y);

                    const updatedLevel50 = updatedLineData.find(d => d.level === 0.5);
                    const updatedLevel618 = updatedLineData.find(d => d.level === 0.618);

                    if (updatedLevel50 && updatedLevel618) {
                        const updatedBandTopY = Math.min(updatedLevel50.y, updatedLevel618.y);
                        const updatedBandHeight = Math.abs(updatedLevel50.y - updatedLevel618.y);
                        fibonacciGroup.select(".golden-zone-band")
                            .attr("y", updatedBandTopY)
                            .attr("height", updatedBandHeight);
                    }
                })
                .on("end", (event, d) => {
                    d3.select(event.subject).attr("stroke", "rgba(255, 215, 0, 0.3)").attr("stroke-width", 1);
                }));
    }

    function handleFibonacciClick(event) {
        if (fibonacciState !== 'selecting') return;

        const targetTagName = event.target.tagName;
        if (targetTagName === 'BUTTON') {
            console.log("Button clicked, ignoring chart Fibonacci selection.");
            return;
        }

        const svgNode = svg.node();
        const svgRect = svgNode.getBoundingClientRect();
        const mouseX = event.clientX - svgRect.left;
        const mouseY = event.clientY - svgRect.top;

        const clickableAreaLeft = margin.left;
        const clickableAreaRight = width - margin.right - 70;
        const clickableAreaTop = margin.top;
        const clickableAreaBottom = height - margin.bottom;

        if (mouseX < clickableAreaLeft || mouseX > clickableAreaRight || mouseY < clickableAreaTop || mouseY > clickableAreaBottom) {
            console.log("Click outside primary chart area ignored for Fibonacci selection.");
            return;
        }

        fibonacciPoints.push({ x: mouseX, y: mouseY });

        if (fibonacciPoints.length === 1) {
            console.log("Fibonacci: Select the second point (0.0%) on the chart.");
            fibonacciGroup.append("circle")
                .attr("class", "fibonacci-temp-anchor")
                .attr("cx", mouseX)
                .attr("cy", mouseY)
                .attr("r", 5)
                .attr("fill", "#ffd700");

        } else if (fibonacciPoints.length === 2) {
            svg.on('click', null);
            svg.style('cursor', 'default');
            fibonacciState = 'active';

            const y1_100 = fibonacciPoints[0].y;
            const y2_0 = fibonacciPoints[1].y;

            fibonacciGroup.selectAll(".fibonacci-temp-anchor").remove();

            drawFibonacciLevels(y1_100, y2_0);
            console.log("Fibonacci: Golden Zone drawn. Drag the faint dashed lines to adjust.");
        }
    }

    function calculateEMA(dataArr, period) {
        const ema = [];
        if (dataArr.length === 0) {
            return [];
        }
        let multiplier = 2 / (period + 1);

        if (dataArr.length < period) {
            return new Array(dataArr.length).fill(null);
        }

        let sma = dataArr.slice(0, period).reduce((a, b) => a + b, 0) / period;
        ema.push(sma);

        for (let i = period; i < dataArr.length; i++) {
            ema.push((dataArr[i] - ema[ema.length - 1]) * multiplier + ema[ema.length - 1]);
        }

        const padding = new Array(period - 1).fill(null);
        return padding.concat(ema);
    }

    function findSwingPoints(dataArr, lookback = 10) {
        const swingLows = [];
        const swingHighs = [];
        if (dataArr.length === 0) return { swingLows, swingHighs };
        const startIndex = Math.max(0, dataArr.length - lookback);

        for(let i = startIndex; i < dataArr.length; i++) {
            let isLow = true;
            for(let j = Math.max(startIndex, i - lookback); j <= Math.min(dataArr.length - 1, i + lookback); j++) {
                if (j !== i && dataArr[i] > dataArr[j]) {
                    isLow = false;
                    break;
                }
            }

            let isHigh = true;
            for(let j = Math.max(startIndex, i - lookback); j <= Math.min(dataArr.length - 1, i + lookback); j++) {
                if (j !== i && dataArr[i] < dataArr[j]) {
                    isHigh = false;
                    break;
                }
            }

            const tolerance = 0.01;

            const isDistinctLow = (i === 0 || dataArr[i] < dataArr[i - 1] - tolerance) && (i === dataArr.length - 1 || dataArr[i] < dataArr[i + 1] - tolerance);
            const isDistinctHigh = (i === 0 || dataArr[i] > dataArr[i - 1] + tolerance) && (i === dataArr.length - 1 || dataArr[i] > dataArr[i + 1] + tolerance);


            if (isLow && isDistinctLow) swingLows.push({ index: i, value: dataArr[i] });
            if (isHigh && isDistinctHigh) swingHighs.push({ index: i, value: dataArr[i] });
        }
        return { swingLows, swingHighs };
    }

    function calculateSupportResistance(dataArr) {
        const lookbackPeriod = Math.min(dataArr.length, 20);

        if (dataArr.length < 5) {
            return { supports: [], resistances: [] };
        }

        const { swingLows, swingHighs } = findSwingPoints(dataArr, lookbackPeriod);

        swingLows.sort((a, b) => b.index - a.index);
        swingHighs.sort((a, b) => b.index - a.index);

        const uniqueSupports = [];
        const uniqueResistances = [];
        const tolerance = 0.03;

        if (swingLows.length > 0) {
            uniqueSupports.push(swingLows[0]);
            for (let i = 1; i < swingLows.length; i++) {
                if (Math.abs(swingLows[i].value - uniqueSupports[0].value) >= tolerance) {
                    uniqueSupports.push(swingLows[i]);
                    break;
                }
            }
        }

        if (swingHighs.length > 0) {
            uniqueResistances.push(swingHighs[0]);
            for (let i = 1; i < swingHighs.length; i++) {
                if (Math.abs(swingHighs[i].value - uniqueResistances[0].value) >= tolerance) {
                    uniqueResistances.push(swingHighs[i]);
                    break;
                }
            }
        }

        return { supports: uniqueSupports.slice(0, 1), resistances: uniqueResistances.slice(0, 1) };
    }

    function getTrend() {
        if (data.length < emaSlowPeriod) {
            return 'neutral';
        }
        const lastEmaFast = emaFast[emaFast.length - 1];
        const lastEmaSlow = emaSlow[emaSlow.length - 1];

        if (lastEmaFast === null || lastEmaSlow === null) {
            return 'neutral';
        }

        const trendTolerance = 0.005;

        if (lastEmaFast > lastEmaSlow + trendTolerance) {
            return 'alcista';
        } else if (lastEmaFast < lastEmaSlow - trendTolerance) {
            return 'bajista';
        } else {
            return 'lateral';
        }
    }

    function getVisibleData() {
        let numVisible;
        let startIndex;

        if (currentZoomLevel >= 0) {
            numVisible = maxDataPoints - currentZoomLevel * 2;
            numVisible = Math.max(5, numVisible);
            startIndex = Math.max(0, data.length - numVisible);
        } else {
            numVisible = maxDataPoints + Math.abs(currentZoomLevel) * 10;
            numVisible = Math.min(data.length, numVisible);
            startIndex = Math.max(0, data.length - numVisible);

            if (numVisible === data.length) {
                startIndex = 0;
            }
        }

        return {
            data: data.slice(startIndex),
            candles: candles.slice(startIndex),
            startIndex: startIndex
        };
    }

    function updateChart() {
        svg.selectAll("*:not(.fibonacci-group)").remove();

        const { data: visibleData, candles: visibleCandles, startIndex } = getVisibleData();

        xScale.domain([startIndex, startIndex + visibleData.length -1 ]);

        const allHighs = visibleCandles.map(c => c ? c.high : 0).filter(v => v !== undefined);
        const allLows = visibleCandles.map(c => c ? c.low : 0).filter(v => v !== undefined);

        const fibChartValues = [];
        if (fibonacciState === 'active' && fibonacciAnchorY.y1_100 !== null && fibonacciAnchorY.y2_0 !== null) {
            try {
                fibChartValues.push(yScale.invert(fibonacciAnchorY.y1_100));
                fibChartValues.push(yScale.invert(fibonacciAnchorY.y2_0));
            } catch (e) {
                console.error("Error inverting fib anchor Ys:", e);
            }
        }

        const srValues = [];
        if (supports.length > 0) srValues.push(supports[0].value);
        if (resistances.length > 0) srValues.push(resistances[0].value);

        const minY = d3.min([0, ...visibleData, ...allLows, ...srValues, ...fibChartValues]);
        const maxY = d3.max([0, ...visibleData, ...allHighs, ...srValues, ...fibChartValues]);

        const padding = (maxY === minY && minY === 0) ? 1 : Math.max(0.5, (maxY - minY) * 0.1);
        yScale.domain([minY - padding, maxY + padding]);

        let trendClass = null;
        const currentTrend = getTrend();
        if (currentTrend === 'alcista') {
            trendClass = 'ema-trend-up';
        } else if (currentTrend === 'bajista') {
            trendClass = 'ema-trend-down';
        }

        chartContainer.classList.remove('ema-trend-up', 'trend-down');
        if (trendClass) {
            chartContainer.classList.add(trendClass);
        }

        svg.append("line")
            .attr("class", "horizontal-line")
            .attr("x1", margin.left)
            .attr("y1", yScale(0))
            .attr("x2", width - margin.right - 70)
            .attr("y2", yScale(0))
            .attr("stroke", "#6c757d")
            .attr("stroke-dasharray", "2,2")
            .attr("opacity", 0.5);

        if (supports.length > 0) {
            svg.append("line")
                .datum(supports[0])
                .attr("class", "support-line")
                .attr("x1", margin.left)
                .attr("y1", d => yScale(d.value))
                .attr("x2", width - margin.right - 70)
                .attr("y2", d => yScale(d.value));
        }

        if (resistances.length > 0) {
            svg.append("line")
                .datum(resistances[0])
                .attr("class", "resistance-line")
                .attr("x1", margin.left)
                .attr("y1", d => yScale(d.value))
                .attr("x2", width - margin.right - 70)
                .attr("y2", d => yScale(d.value));
        }

        if (visibleData.length > 0) {
            const currentValue = visibleData[visibleData.length - 1];
            svg.append("line")
                .attr("class", "current-level-line")
                .attr("x1", margin.left)
                .attr("y1", yScale(currentValue))
                .attr("x2", width - margin.right - 70)
                .attr("y2", yScale(currentValue));
        }

        svg.selectAll("line.wick")
            .data(visibleCandles)
            .enter().append("line")
            .attr("class", "wick")
            .attr("x1", (d, i) => xScale(startIndex + i))
            .attr("x2", (d, i) => xScale(startIndex + i))
            .attr("y1", d => yScale(d.high))
            .attr("y2", d => yScale(d.low))
            .attr("stroke", d => (d.close >= d.open ? "#00ff00" : "#ff0000"))
            .attr("stroke-width", 1)
            .attr("opacity", 0.8);

        if (visibleCandles.length > 1) {
            const connectionWicks = visibleCandles.slice(1).map((currentCandle, i) => {
                const prevCandle = visibleCandles[i];
                if (prevCandle.close !== currentCandle.open) {
                    return {
                        index: startIndex + i + 1,
                        y1: yScale(prevCandle.close),
                        y2: yScale(currentCandle.open),
                        color: currentCandle.close >= currentCandle.open ? "#00ff00" : "#ff0000"
                    };
                }
                return null;
            }).filter(d => d !== null);

            svg.selectAll("line.connection-wick")
                .data(connectionWicks)
                .enter().append("line")
                .attr("class", "connection-wick")
                .attr("x1", d => xScale(d.index))
                .attr("x2", d => xScale(d.index))
                .attr("y1", d => d.y1)
                .attr("y2", d => d.y2)
                .attr("stroke", d => d.color)
                .attr("stroke-width", 1)
                .attr("opacity", 0.8);
        }

        svg.selectAll("rect.candle")
            .data(visibleCandles)
            .enter().append("rect")
            .attr("class", (d, i) => {
                const globalIndex = startIndex + i;
                return `candle`;
            })
            .attr("x", (d, i) => xScale(startIndex + i) - (width - margin.right - margin.left - 70) / (visibleData.length || 1) * 0.35)
            .attr("width", (width - margin.right - margin.left - 70) / (visibleData.length || 1) * 0.7)
            .attr("height", d => Math.abs(yScale(d.open) - yScale(d.close)) || 1)
            .attr("y", d => yScale(Math.max(d.open, d.close)))
            .attr("fill", d => (d.close >= d.open ? "#28a745" : "#dc3545"));

        const validEmaFast = emaFast.slice(startIndex).map((value, index) => ({ index: startIndex + index, value: value })).filter(d => d.value !== null);
        const validEmaSlow = emaSlow.slice(startIndex).map((value, index) => ({ index: startIndex + index, value: value })).filter(d => d.value !== null);

        const lineGenerator = d3.line()
            .x(d => xScale(d.index))
            .y(d => yScale(d.value))
            .defined(d => d.value !== null)
            .curve(d3.curveMonotoneX);

        if (validEmaFast.length > 0) {
            svg.append("path")
                .datum(validEmaFast)
                .attr("fill", "none")
                .attr("class", "ema-fast neon-blue")
                .attr("d", lineGenerator);
        }

        if (validEmaSlow.length > 0) {
            svg.append("path")
                .datum(validEmaSlow)
                .attr("fill", "none")
                .attr("class", "ema-slow neon-golden")
                .attr("d", lineGenerator);
        }

        if (visibleData.length > 0) {
            const currentValue = visibleData[visibleData.length - 1];
            const highlightTolerance = 0.02;

            if (supports.length > 0) {
                const supportValue = supports[0].value;
                const supportLine = svg.select(".support-line");
                if (Math.abs(currentValue - supportValue) < highlightTolerance) {
                    supportLine.attr("class", "support-line neon-green-sr");
                } else {
                    supportLine.attr("class", "support-line");
                }
            }

            if (resistances.length > 0) {
                const resistanceValue = resistances[0].value;
                const resistanceLine = svg.select(".resistance-line");
                if (Math.abs(currentValue - resistanceValue) < highlightTolerance) {
                    resistanceLine.attr("class", "resistance-line neon-red-sr");
                } else {
                    resistanceLine.attr("class", "resistance-line");
                }
            }
        }

        if (fibonacciState === 'active' && fibonacciAnchorY.y1_100 !== null && fibonacciAnchorY.y2_0 !== null) {
            drawFibonacciLevels(fibonacciAnchorY.y1_100, fibonacciAnchorY.y2_0);
        }
    }

    // New: Signal and Session State
    let signalState = {
        status: 'none', // 'none', 'entrada_pending', 'awaiting_result'
        consecutiveFails: 0,
        consecutiveEntradas: 0 // New: Counter for consecutive "ENTRADA" signals
    };
    let sessionStats = {
        hits: 0,
        misses: 0
    };
    const SIGNAL_THRESHOLD = 1; // Corresponds to data-value="1" (2.00/3.99) or higher

    // New: DOM elements for messages and stats
    const signalOverlayMessage = document.getElementById('signal-overlay-message');
    const sessionStatsDiv = document.getElementById('session-stats');

    function updateCounters() {
        sessionStatsDiv.innerHTML = `Aciertos: <span class="stat-hits">${sessionStats.hits}</span> | Fallos: <span class="stat-misses">${sessionStats.misses}</span>`;
    }

    function displaySignalMessage(type, message) {
        signalOverlayMessage.textContent = message;
        // Remove all type-related classes before adding the new one
        signalOverlayMessage.classList.remove('entrada', 'acierto', 'fail_retry', 'fallo');
        signalOverlayMessage.classList.add(type); // Apply type-specific class
        signalOverlayMessage.style.display = 'block'; // Make visible
        signalOverlayMessage.classList.remove('fade-in'); // Reset animation
        void signalOverlayMessage.offsetWidth; // Trigger reflow
        signalOverlayMessage.classList.add('fade-in'); // Add animation class
    }

    function clearSignalMessage() {
        signalOverlayMessage.classList.remove('fade-in');
        signalOverlayMessage.style.display = 'none';
        signalOverlayMessage.textContent = '';
        signalOverlayMessage.classList.remove('entrada', 'acierto', 'fail_retry', 'fallo'); // Clean up classes
    }

    function checkAndGenerateEntradaSignal() {
        // Prevent generating an "ENTRADA" signal if a signal is already pending/awaiting result
        // OR if the maximum number of consecutive "ENTRADA" signals has been reached.
        if (signalState.status !== 'none' || signalState.consecutiveEntradas >= 3) {
            if (signalState.consecutiveEntradas >= 3) {
                console.log("Max consecutive 'ENTRADA' signals reached. System waiting for non-signal-related action or reset.");
            }
            return;
        }

        // --- Prediction Logic ---
        // Rule: If the trend is 'alcista' AND there are at least 5 data points
        // AND the last value is below the SIGNAL_THRESHOLD (1, meaning below 2.00/3.99)
        // AND the last candle was bullish (green).
        const currentTrend = getTrend();
        const lastCandle = candles.length > 0 ? candles[candles.length - 1] : null;
        const isBullishCandle = lastCandle && lastCandle.close >= lastCandle.open;
        const lastDataPointAccumulatedValue = data.length > 0 ? data[data.length - 1] : 0; // Use accumulated value

        if (currentTrend === 'alcista' && data.length >= 5 && lastDataPointAccumulatedValue < 2.00 && isBullishCandle) {
            signalState.status = 'entrada_pending';
            displaySignalMessage('entrada', 'Â¡ENTRADA!');
            signalState.consecutiveFails = 0; // Reset consecutive fails for a new entry signal
            signalState.consecutiveEntradas++; // Increment consecutive "ENTRADA" count
            console.log("Generated 'ENTRADA' signal. Consecutive: ", signalState.consecutiveEntradas);
        }
    }

    // Helper function to add a data point and re-evaluate signals
    function addDataPoint(value, miniValue, buttonOriginalValue) {
        const currentOpen = candles.length > 0 ? candles[candles.length - 1].close : 0;
        accumulatedValue += value;
        const currentClose = accumulatedValue;

        data.push(currentClose);

        let candleHigh = Math.max(currentOpen, currentClose);
        let candleLow = Math.min(currentOpen, currentClose);

        const wickMagnitude = Math.abs(value) * 0.1; // Simple wick simulation
        candleHigh = Math.max(candleHigh, Math.max(currentOpen, currentClose) + wickMagnitude);
        candleLow = Math.min(candleLow, Math.min(currentOpen, currentClose) - wickMagnitude);

        candles.push({ open: currentOpen, close: currentClose, high: candleHigh, low: candleLow });

        const { supports: newSupports, resistances: newResistances } = calculateSupportResistance(data);
        supports = newSupports;
        resistances = newResistances;
        emaFast = calculateEMA(data, emaFastPeriod);
        emaSlow = calculateEMA(data, emaSlowPeriod);

        updateChart(); // Update chart before signal detection for correct rendering context
        window.addMiniChartData({ value: miniValue, category: buttonOriginalValue });
    }

    buttons.addEventListener('click', (event) => {
        // Find the closest button element to the clicked target
        const clickedButton = event.target.closest('button');
        if (!clickedButton) {
            return; // If the click wasn't on a button or its child, do nothing
        }

        if (clickedButton.dataset.action === 'fibonacci') {
            if (fibonacciState === 'inactive') {
                clearFibonacci();
                fibonacciState = 'selecting';
                fibonacciPoints = [];
                svg.style('cursor', 'crosshair');
                svg.on('click', handleFibonacciClick);
                console.log("Fibonacci: Select the first point (100%) on the chart.");
            } else {
                clearFibonacci();
                console.log("Fibonacci: Deactivated.");
            }
            // Clear any lingering signal message if a tool is activated/deactivated
            clearSignalMessage();
            return;
        }

        if (clickedButton.dataset.action === 'mini-fibonacci') {
            window.toggleMiniFibonacci();
            // Clear any lingering signal message if a tool is activated/deactivated
            clearSignalMessage();
            return;
        }

        if (clickedButton.id === 'zoom-in') {
            const currentNumVisible = Math.max(5, maxDataPoints - currentZoomLevel * 2);
            if (currentNumVisible > 5 && data.length > 5) {
                currentZoomLevel = Math.max(0, currentZoomLevel + 1);
            } else if (data.length <= 5) {
                currentZoomLevel = 0;
            }
            updateChart();
            window.setMiniChartZoom(currentZoomLevel);
            // Clear any lingering signal message after zoom
            clearSignalMessage();
            return;
        }

        if (clickedButton.id === 'zoom-out') {
            const maxZoomOutLevel = -Math.floor((data.length - maxDataPoints) / 5);

            if (data.length > 0 && currentZoomLevel > maxZoomOutLevel) {
                 currentZoomLevel = currentZoomLevel - 1;
            } else if (data.length > 0) {
                 currentZoomLevel = maxZoomOutLevel;
            } else {
                currentZoomLevel = 0;
            }
            updateChart();
            window.setMiniChartZoom(currentZoomLevel);
            // Clear any lingering signal message after zoom
            clearSignalMessage();
            return;
        }

        if (clickedButton.id === 'undo') {
            if (data.length > 0) {
                data.pop();
                candles.pop();
                accumulatedValue = data.length > 0 ? data[data.length - 1] : 0;

                const { supports: newSupports, resistances: newResistances } = calculateSupportResistance(data);
                supports = newSupports;
                resistances = newResistances;
                emaFast = calculateEMA(data, emaFastPeriod);
                emaSlow = calculateEMA(data, emaSlowPeriod);

                updateChart();
                window.removeMiniChartData();
                // If undoing, clear signal message and reset signal state, including consecutiveEntradas
                clearSignalMessage();
                signalState = { status: 'none', consecutiveFails: 0, consecutiveEntradas: 0 };
            }
            return;
        }

        if (clickedButton.id === 'reset') {
            data = [];
            accumulatedValue = 0;
            candles = [];
            supports = [];
            resistances = [];
            currentZoomLevel = 0;

            emaFast = calculateEMA(data, emaFastPeriod);
            emaSlow = calculateEMA(data, emaSlowPeriod);

            chartContainer.classList.remove('ema-trend-up', 'trend-down');

            clearFibonacci();
            // Reset signal specific state, including consecutiveEntradas
            signalState = { status: 'none', consecutiveFails: 0, consecutiveEntradas: 0 };
            sessionStats = { hits: 0, misses: 0 };
            clearSignalMessage();
            updateCounters();

            updateChart();
            window.resetMiniChart();
            return;
        }

        if (clickedButton.tagName === 'BUTTON' && clickedButton.dataset.value) {
            if (fibonacciState === 'selecting' || (window.miniFibonacciState && window.miniFibonacciState === 'selecting')) {
                console.log("Finish Fibonacci selection or deactivate tool before adding new points.");
                return;
            }

            const value = parseFloat(clickedButton.dataset.value); // This is the 'raw' value from the button, not the accumulated
            const miniValue = parseFloat(clickedButton.dataset.miniValue);
            const buttonOriginalValue = clickedButton.dataset.value;

            if (!isNaN(value) && !isNaN(miniValue)) {
                // --- Signal Evaluation BEFORE adding the new point ---
                if (signalState.status === 'entrada_pending') {
                    clearSignalMessage(); // Clear the "ENTRADA" message immediately
                    if (value >= SIGNAL_THRESHOLD) { // 1 corresponds to 2.00 / 3.99 and higher ranges
                        sessionStats.hits++;
                        displaySignalMessage('acierto', 'Â¡ACIERTO!');
                        signalState.status = 'none'; // Reset status after a hit
                        signalState.consecutiveFails = 0; // Reset consecutive fails
                        // consecutiveEntradas is NOT reset here; it remains to count total consecutive ENTRADA signals
                    } else { // Value is < SIGNAL_THRESHOLD
                        signalState.consecutiveFails++;
                        if (signalState.consecutiveFails === 1) {
                            displaySignalMessage('fail_retry', 'PUEDES BUSCAR DE NUEVO, GESTIONA CORRECTAMENTE');
                            signalState.status = 'awaiting_result'; // Stay in awaiting_result after first fail
                        } else if (signalState.consecutiveFails >= 2) { // 2nd or more consecutive fail
                            sessionStats.misses++;
                            displaySignalMessage('fallo', 'Â¡FALLO!');
                            signalState.status = 'none'; // Reset status after second fail
                            signalState.consecutiveFails = 0; // Reset consecutive fails
                        }
                        // consecutiveEntradas is NOT reset here
                    }
                    updateCounters();
                } else if (signalState.status === 'awaiting_result') { // If previously a 'fail_retry' occurred
                    clearSignalMessage(); // Clear previous fail_retry message
                    if (value >= SIGNAL_THRESHOLD) {
                        sessionStats.hits++;
                        displaySignalMessage('acierto', 'Â¡ACIERTO!');
                        signalState.status = 'none'; // Reset status after a hit
                        signalState.consecutiveFails = 0;
                        // consecutiveEntradas is NOT reset here
                    } else { // It's a second consecutive fail
                        signalState.consecutiveFails++;
                        sessionStats.misses++;
                        displaySignalMessage('fallo', 'Â¡FALLO!');
                        signalState.status = 'none'; // Reset status after second consecutive fail
                        signalState.consecutiveFails = 0;
                        // consecutiveEntradas is NOT reset here
                    }
                    updateCounters();
                } else {
                    // No signal pending, ensure any old message is cleared
                    clearSignalMessage();
                    // If a button is pressed manually, break the "consecutive ENTRADA" streak
                    signalState.consecutiveEntradas = 0;
                    console.log("Manual entry detected, consecutiveEntradas reset to 0.");
                }

                addDataPoint(value, miniValue, buttonOriginalValue); // Add the new point
                // After adding data, check if a new 'ENTRADA' signal should be generated
                checkAndGenerateEntradaSignal();
            }
        }
    });

    function resizeChart() {
        width = chartContainer.offsetWidth;
        height = chartContainer.offsetHeight;
        innerWidth = width - margin.left - margin.right;
        innerHeight = height - margin.top - margin.bottom;

        xScale.range([margin.left, width - margin.right - 70]); // Preserve existing -70 offset
        yScale.range([height - margin.bottom, margin.top]);

        // Clear Fibonacci on resize to prevent distortion and allow redraw if active
        // This is a design choice; could try to scale it but often simpler to reset.
        if (fibonacciState !== 'inactive') {
            clearFibonacci();
        }

        updateChart();
    }

    // New: Function to apply view mode classes to chart-container
    function setChartViewMode(mode) {
        chartContainer.classList.remove('chart-mode-main', 'chart-mode-mini', 'chart-mode-both');
        if (mode === 'main') {
            chartContainer.classList.add('chart-mode-main');
            resizeChart(); // Recalculate main chart size
        } else if (mode === 'mini') {
            chartContainer.classList.add('chart-mode-mini');
            if (window.resizeMiniChart) {
                window.resizeMiniChart(); // Recalculate mini chart size
            }
        } else { // 'both'
            chartContainer.classList.add('chart-mode-both');
            resizeChart();
            if (window.resizeMiniChart) {
                window.resizeMiniChart();
            }
        }
    }

    // Event listener for dropdown
    chartViewSelector.addEventListener('change', (event) => {
        const selectedMode = event.target.value;
        setChartViewMode(selectedMode);
        // Clear any lingering signal message if view mode changes
        clearSignalMessage();
    });

    window.addEventListener('resize', () => {
        // Only call resize for the currently active chart
        if (chartContainer.classList.contains('chart-mode-main') || chartContainer.classList.contains('chart-mode-both')) {
            resizeChart();
        }
        if (chartContainer.classList.contains('chart-mode-mini') || chartContainer.classList.contains('chart-mode-both')) {
            if (window.resizeMiniChart) {
                window.resizeMiniChart();
            }
        }
        // Reposition and clear message on resize
        clearSignalMessage();
    });

    // Initial calculations and chart draw
    emaFast = calculateEMA(data, emaFastPeriod);
    emaSlow = calculateEMA(data, emaSlowPeriod);
    
    // Set initial view mode
    chartViewSelector.value = 'both'; // Ensure dropdown reflects initial state
    setChartViewMode('both'); // Apply initial styling and sizing
    updateCounters(); // Display initial counters
});