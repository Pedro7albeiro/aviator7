document.addEventListener('DOMContentLoaded', () => {
    const miniChartContainer = document.getElementById('mini-chart-container');
    const miniSvg = d3.select("#mini-chart");

    let miniWidth = miniChartContainer.offsetWidth;
    let miniHeight = miniChartContainer.offsetHeight;
    let miniMargin = { top: 10, right: 10, bottom: 20, left: 30 };
    let miniInnerWidth = miniWidth - miniMargin.left - miniMargin.right;
    let miniInnerHeight = miniHeight - miniMargin.top - miniMargin.bottom;

    const miniXScale = d3.scaleLinear().range([miniMargin.left, miniWidth - miniMargin.right]);
    const miniYScale = d3.scaleLinear().range([miniHeight - miniMargin.bottom, miniMargin.top]);

    // Mini chart data - now stores objects { accumulatedValue, category }
    let miniData = [];
    let miniAccumulatedValue = 0;
    let miniSupports = []; // New: Supports for mini-chart
    let miniResistances = []; // New: Resistances for mini-chart

    // Updated EMA periods for mini chart
    const miniEmaFastPeriod = 3;
    const miniEmaSlowPeriod = 5;

    let miniEmaFast = [];
    let miniEmaSlow = [];

    const miniMaxDataPoints = 30; // Max points for mini chart
    let currentMiniZoomLevel = 0; // Synchronized with main chart's zoom level

    // --- Fibonacci Variables and Functions for Mini Chart ---
    let miniFibonacciState = 'inactive'; // 'inactive', 'selecting', 'active'
    let miniFibonacciPoints = []; // Stores [{x, y}, {x, y}] screen coordinates from selection
    let miniFibonacciAnchorY = { y1_100: null, y2_0: null };

    const miniFibLevels = [
        { level: 0.0, label: '0.0%' },
        { level: 0.236, label: '23.6%' },
        { level: 0.382, label: '38.2%' },
        { level: 0.5, label: '50.0%' },
        { level: 0.618, label: '61.8%' },
        { level: 0.786, label: '78.6%' },
        { level: 1.0, label: '100.0%' }
    ];

    const miniFibonacciGroup = miniSvg.append('g').attr('class', 'mini-fibonacci-group');

    // Function to clear all mini fibonacci elements and state
    function clearMiniFibonacci() {
        miniFibonacciGroup.selectAll("*").remove();
        miniFibonacciPoints = [];
        miniFibonacciAnchorY = { y1_100: null, y2_0: null };
        miniFibonacciState = 'inactive';
        miniSvg.on('click', null); // IMPORTANT: Unbind the click listener
        miniSvg.style('cursor', 'default');
        console.log("Mini Fibonacci: Levels cleared.");
    }

    // Function to draw/update mini fibonacci levels
    function drawMiniFibonacciLevels(y1_100, y2_0) {
        miniFibonacciGroup.selectAll("*").remove();

        miniFibonacciAnchorY = { y1_100: y1_100, y2_0: y2_0 };

        const fibLineData = miniFibLevels.map(d => {
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

            miniFibonacciGroup.append("rect")
                .attr("class", "mini-golden-zone-band")
                .attr("x", miniMargin.left)
                .attr("y", bandTopY)
                .attr("width", miniWidth - miniMargin.left - miniMargin.right)
                .attr("height", bandHeight);
        }

        miniFibonacciGroup.selectAll(".mini-fibonacci-anchor-line")
            .data(fibLineData.filter(d => d.isAnchor))
            .enter().append("line")
            .attr("class", "mini-fibonacci-anchor-line")
            .attr("x1", miniMargin.left)
            .attr("x2", miniWidth - miniMargin.right)
            .attr("y1", d => d.y)
            .attr("y2", d => d.y)
            .call(d3.drag()
                .on("start", miniDragstarted)
                .on("drag", miniDragged)
                .on("end", miniDragended));
    }

    function miniDragstarted(event, d) {
        d3.select(event.subject).attr("stroke", "cyan").attr("stroke-width", 2);
    }

    function miniDragged(event, d) {
        const newY = Math.max(miniMargin.top, Math.min(miniHeight - miniMargin.bottom, event.y));

        if (d.level === 1.0) {
            miniFibonacciAnchorY.y1_100 = newY;
        } else if (d.level === 0.0) {
            miniFibonacciAnchorY.y2_0 = newY;
        }

        const currentY100 = miniFibonacciAnchorY.y1_100;
        const currentY0 = miniFibonacciAnchorY.y2_0;

        const updatedLineData = miniFibLevels.map(f => {
            const levelY = currentY0 + (currentY100 - currentY0) * f.level;
            return { ...f, y: levelY, isAnchor: f.level === 0.0 || f.level === 1.0 };
        });

        miniFibonacciGroup.selectAll(".mini-fibonacci-anchor-line")
            .data(updatedLineData.filter(d => d.isAnchor))
            .attr("y1", f => f.y)
            .attr("y2", f => f.y);

        const updatedLevel50 = updatedLineData.find(d => d.level === 0.5);
        const updatedLevel618 = updatedLineData.find(d => d.level === 0.618);

        if (updatedLevel50 && updatedLevel618) {
            const updatedBandTopY = Math.min(updatedLevel50.y, updatedLevel618.y);
            const updatedBandHeight = Math.abs(updatedLevel50.y - updatedLevel618.y);
            miniFibonacciGroup.select(".mini-golden-zone-band")
                .attr("y", updatedBandTopY)
                .attr("height", updatedBandHeight);
        }
    }

    function miniDragended(event, d) {
        d3.select(event.subject).attr("stroke", "rgba(255, 215, 0, 0.3)").attr("stroke-width", 1);
    }

    function handleMiniFibonacciClick(event) {
        if (miniFibonacciState !== 'selecting') return;

        // Check if a button was clicked; if so, ignore the chart click for Fibonacci
        const targetTagName = event.target.tagName;
        if (targetTagName === 'BUTTON') {
            console.log("Button clicked, ignoring mini chart Fibonacci selection.");
            return;
        }

        const miniSvgNode = miniSvg.node();
        const miniSvgRect = miniSvgNode.getBoundingClientRect();
        const mouseX = event.clientX - miniSvgRect.left;
        const mouseY = event.clientY - miniSvgRect.top;

        const clickableAreaLeft = miniMargin.left;
        const clickableAreaRight = miniWidth - miniMargin.right;
        const clickableAreaTop = miniMargin.top;
        const clickableAreaBottom = miniHeight - miniMargin.bottom;

        if (mouseX < clickableAreaLeft || mouseX > clickableAreaRight || mouseY < clickableAreaTop || mouseY > clickableAreaBottom) {
            console.log("Click outside mini chart area ignored for Fibonacci selection.");
            return;
        }

        miniFibonacciPoints.push({ x: mouseX, y: mouseY });

        if (miniFibonacciPoints.length === 1) {
            console.log("Mini Fibonacci: Select the second point (0.0%) on the mini chart.");
            miniFibonacciGroup.append("circle")
                .attr("class", "mini-fibonacci-temp-anchor")
                .attr("cx", mouseX)
                .attr("cy", mouseY)
                .attr("r", 3)
                .attr("fill", "#ffd700");

        } else if (miniFibonacciPoints.length === 2) {
            // Remove the click listener once two points are selected
            miniSvg.on('click', null);
            miniSvg.style('cursor', 'default');
            miniFibonacciState = 'active';

            const y1_100 = miniFibonacciPoints[0].y;
            const y2_0 = miniFibonacciPoints[1].y;

            miniFibonacciGroup.selectAll(".mini-fibonacci-temp-anchor").remove();
            drawMiniFibonacciLevels(y1_100, y2_0);
            console.log("Mini Fibonacci: Golden Zone drawn. Drag the faint dashed lines to adjust.");
        }
    }
    // --- End Fibonacci Variables and Functions for Mini Chart ---

    // Helper function for mini chart EMA calculation
    function calculateMiniEMA(dataArr, period) {
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

    // Helper function for mini chart's swing points (simplified)
    function findMiniSwingPoints(dataArr, lookback = 5) {
        const swingLows = [];
        const swingHighs = [];
        if (dataArr.length === 0) return { swingLows, swingHighs };
        const startIndex = Math.max(0, dataArr.length - lookback);

        for (let i = startIndex; i < dataArr.length; i++) {
            let isLow = true;
            for (let j = Math.max(startIndex, i - lookback); j <= Math.min(dataArr.length - 1, i + lookback); j++) {
                if (j !== i && dataArr[i] > dataArr[j]) {
                    isLow = false;
                    break;
                }
            }

            let isHigh = true;
            for (let j = Math.max(startIndex, i - lookback); j <= Math.min(dataArr.length - 1, i + lookback); j++) {
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

    // Function to calculate Support/Resistance for mini chart
    function calculateMiniSupportResistance(dataArr) {
        const lookbackPeriod = Math.min(dataArr.length, 10); // Smaller lookback for mini chart

        if (dataArr.length < 3) { // Need enough data for swings
            return { supports: [], resistances: [] };
        }

        // Pass only the accumulated values to swing point calculation
        const valuesOnly = dataArr.map(d => d.accumulatedValue);
        const { swingLows, swingHighs } = findMiniSwingPoints(valuesOnly, lookbackPeriod);

        swingLows.sort((a, b) => b.index - a.index);
        swingHighs.sort((a, b) => b.index - a.index);

        const uniqueSupports = [];
        const uniqueResistances = [];
        const tolerance = 0.02; // Slightly smaller tolerance for mini chart

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

    // Function to determine overall trend for mini chart
    function getMiniChartTrend() {
        if (miniData.length < miniEmaSlowPeriod) {
            return 'neutral';
        }
        const lastEmaFast = miniEmaFast[miniEmaFast.length - 1];
        const lastEmaSlow = miniEmaSlow[miniEmaSlow.length - 1];

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

    // Helper function for momentum: recent price change for mini chart
    function getMiniChartMomentum(lookback = 3) {
        if (miniData.length < lookback) return 0;
        const recentData = miniData.slice(-lookback).map(d => d.accumulatedValue);
        return recentData[recentData.length - 1] - recentData[0];
    }

    // Helper function to get average range for mini chart data
    function getMiniChartAverageRange(lookback = 10) {
        if (miniData.length < 2) return 0.01;
        const recentData = miniData.slice(-Math.min(miniData.length, lookback)).map(d => d.accumulatedValue);
        const maxVal = d3.max(recentData);
        const minVal = d3.min(recentData);
        return Math.max(0.01, (maxVal - minVal) / (recentData.length || 1));
    }

    // Function to get visible data for mini chart based on its own zoom level
    function getMiniChartVisibleData() {
        let numVisible;
        let startIndex;

        if (currentMiniZoomLevel >= 0) {
            // Zoom In: Show a fixed number of recent data points
            numVisible = miniMaxDataPoints - currentMiniZoomLevel * 2;
            numVisible = Math.max(5, numVisible); // Ensure at least 5 candles are always visible
            startIndex = Math.max(0, miniData.length - numVisible);
        } else {
            // Zoom Out: Show more historical data
            numVisible = miniMaxDataPoints + Math.abs(currentMiniZoomLevel) * 5; // Show 5 more points per 'zoom out' step
            numVisible = Math.min(miniData.length, numVisible); // Never show more than available data
            startIndex = Math.max(0, miniData.length - numVisible);

            // If we are fully zoomed out, show all data
            if (numVisible === miniData.length) {
                startIndex = 0;
            }
        }

        return {
            data: miniData.slice(startIndex),
            startIndex: startIndex
        };
    }

    // Function to map button category to point color
    function getMiniPointColor(category) {
        switch (category) {
            case "-5": // 1.00 / 1.09
            case "-4": // 1.10 / 1.29
            case "-3": // 1.30 / 1.49
                return "red";
            case "-2": // 1.50 / 1.79
            case "-1": // 1.80 / 1.99
                return "white";
            case "1": // 2.00 / 3.99
            case "2": // 4.00 / 5.99
                return "#00ff00"; // Pure green for more luminosity
            case "3": // 6.00 / 7.99
            case "4": // 8.00 / 9.99
                return "gold"; // Dorado
            case "5": // 10+
                return "deeppink"; // Rosado
            default:
                return "gray"; // Fallback color
        }
    }

    function updateMiniChart() {
        miniSvg.selectAll("*:not(.mini-fibonacci-group)").remove(); // Keep fibonacci group

        const { data: visibleMiniData, startIndex: miniStartIndex } = getMiniChartVisibleData();
        const visibleMiniValues = visibleMiniData.map(d => d.accumulatedValue);

        if (!visibleMiniData || visibleMiniData.length === 0) {
            // If fibonacci is active, we still need to redraw it even with no data
            if (miniFibonacciState === 'active' && miniFibonacciAnchorY.y1_100 !== null && miniFibonacciAnchorY.y2_0 !== null) {
                drawMiniFibonacciLevels(miniFibonacciAnchorY.y1_100, miniFibonacciAnchorY.y2_0);
            }
            return; // Exit if miniData is empty or not defined
        }

        // Calculate mini chart S/R and EMAs for the visible data values
        const { supports: currentMiniSupports, resistances: currentMiniResistances } = calculateMiniSupportResistance(miniData); // Pass full miniData for S/R to have context
        miniSupports = currentMiniSupports;
        miniResistances = currentMiniResistances;

        // EMAs should be calculated on the full miniData array (values only), then sliced for visibility
        miniEmaFast = calculateMiniEMA(miniData.map(d => d.accumulatedValue), miniEmaFastPeriod);
        miniEmaSlow = calculateMiniEMA(miniData.map(d => d.accumulatedValue), miniEmaSlowPeriod);

        const allValues = [...visibleMiniValues, ...miniSupports.map(d => d.value), ...miniResistances.map(d => d.value)];
        // Add EMA values to the domain calculation
        const visibleEmaFastValues = miniEmaFast.slice(miniStartIndex).map((value, index) => ({ index: miniStartIndex + index, value: value })).filter(d => d.value !== null);
        const visibleEmaSlowValues = miniEmaSlow.slice(miniStartIndex).map((value, index) => ({ index: miniStartIndex + index, value: value })).filter(d => d.value !== null);

        // Include the chart values corresponding to the Fibonacci anchors in the domain calculation
        const fibChartValues = [];
        if (miniFibonacciState === 'active' && miniFibonacciAnchorY.y1_100 !== null && miniFibonacciAnchorY.y2_0 !== null) {
            try {
                // Invert using current scales, handle potential issues
                fibChartValues.push(miniYScale.invert(miniFibonacciAnchorY.y1_100));
                fibChartValues.push(miniYScale.invert(miniFibonacciAnchorY.y2_0));
            } catch (e) {
                console.error("Error inverting mini fib anchor Ys:", e);
            }
        }

        // Update scales based on visible data values
        miniXScale.domain([miniStartIndex, miniStartIndex + visibleMiniData.length - 1]);
        miniYScale.domain(d3.extent([0, ...allValues, ...visibleEmaFastValues.map(d => d.value), ...visibleEmaSlowValues.map(d => d.value), ...fibChartValues]));

        // Draw line
        miniSvg.append("path")
            .datum(visibleMiniData)
            .attr("fill", "none")
            .attr("stroke", "#fff")
            .attr("stroke-width", 1.5)
            .attr("opacity", 0.7) // Make the line translucent
            .attr("d", d3.line()
                .x((d, i) => miniXScale(miniStartIndex + i)) // Adjust x for visible data's index
                .y(d => miniYScale(d.accumulatedValue)) // Use accumulatedValue for Y
                .curve(d3.curveLinear));

        // Draw horizontal line at current level
        if (visibleMiniData.length > 0) {
            const lastValue = visibleMiniData[visibleMiniData.length - 1].accumulatedValue;
            miniSvg.append("line")
                .attr("x1", miniMargin.left)
                .attr("x2", miniWidth - miniMargin.right)
                .attr("y1", miniYScale(lastValue))
                .attr("y2", miniYScale(lastValue))
                .attr("stroke", "white")
                .attr("stroke-width", 1)
                .attr("opacity", 0.5)
                .attr("stroke-dasharray", "3,3"); // Optional: dashed line for better visibility
        }

        // Draw points with dynamic color and glow
        miniSvg.selectAll("circle.mini-point")
            .data(visibleMiniData)
            .enter().append("circle")
            .attr("class", "mini-point")
            .attr("cx", (d, i) => miniXScale(miniStartIndex + i)) // Adjust cx for visible data's index
            .attr("cy", d => miniYScale(d.accumulatedValue)) // Use accumulatedValue for Y
            .attr("r", 3) // Slightly smaller radius
            .attr("fill", d => getMiniPointColor(d.category))
            .style("filter", d => `drop-shadow(0 0 5px ${getMiniPointColor(d.category)})`);

        // Draw mini support lines
        const miniSupportLine = miniSvg.selectAll(".mini-support-line")
            .data(miniSupports)
            .enter().append("line")
            .attr("class", "mini-support-line")
            .attr("x1", miniMargin.left)
            .attr("y1", d => miniYScale(d.value))
            .attr("x2", miniWidth - miniMargin.right)
            .attr("y2", d => miniYScale(d.value));

        // Draw mini resistance lines
        const miniResistanceLine = miniSvg.selectAll(".mini-resistance-line")
            .data(miniResistances)
            .enter().append("line")
            .attr("class", "mini-resistance-line")
            .attr("x1", miniMargin.left)
            .attr("y1", d => miniYScale(d.value))
            .attr("x2", miniWidth - miniMargin.right)
            .attr("y2", d => miniYScale(d.value));

        // Apply neon effect to mini S/R lines if close to current value
        if (visibleMiniData.length > 0) {
            const currentMiniValue = visibleMiniData[visibleMiniData.length - 1].accumulatedValue;
            const highlightTolerance = 0.05; // Adjust tolerance for mini chart

            if (miniSupports.length > 0) {
                const supportValue = miniSupports[0].value;
                if (Math.abs(currentMiniValue - supportValue) < highlightTolerance) {
                    miniSupportLine.attr("class", "mini-support-line mini-neon-green-sr");
                } else {
                    miniSupportLine.attr("class", "mini-support-line");
                }
            }

            if (miniResistances.length > 0) {
                const resistanceValue = miniResistances[0].value;
                if (Math.abs(currentMiniValue - resistanceValue) < highlightTolerance) {
                    miniResistanceLine.attr("class", "mini-resistance-line mini-neon-red-sr");
                } else {
                    miniResistanceLine.attr("class", "mini-resistance-line");
                }
            }
        }

        // Draw mini EMA lines
        const miniLineGenerator = d3.line()
            .x(d => miniXScale(d.index))
            .y(d => miniYScale(d.value))
            .defined(d => d.value !== null)
            .curve(d3.curveMonotoneX);

        if (visibleEmaFastValues.length > 0) {
            miniSvg.append("path")
                .datum(visibleEmaFastValues)
                .attr("fill", "none")
                .attr("stroke", "#0ff") // Cyan for Fast EMA
                .attr("stroke-width", 1)
                .attr("opacity", 0.4) // Make the EMA lines more translucent
                .attr("d", miniLineGenerator);
        }

        if (visibleEmaSlowValues.length > 0) {
            miniSvg.append("path")
                .datum(visibleEmaSlowValues)
                .attr("fill", "none")
                .attr("stroke", "#ffd700") // Gold for Slow EMA
                .attr("stroke-width", 1)
                .attr("opacity", 0.4) // Make the EMA lines more translucent
                .attr("d", miniLineGenerator);
        }

        // If Mini Fibonacci is active, redraw it.
        if (miniFibonacciState === 'active' && miniFibonacciAnchorY.y1_100 !== null && miniFibonacciAnchorY.y2_0 !== null) {
            drawMiniFibonacciLevels(miniFibonacciAnchorY.y1_100, miniFibonacciAnchorY.y2_0);
        }
    }

    // New function to add data and update the mini chart
    // Now accepts an object { accumulatedValue, category }
    function addMiniChartData(pointData) {
        miniAccumulatedValue += pointData.value;
        miniData.push({ accumulatedValue: miniAccumulatedValue, category: pointData.category });

        // Recalculate EMAs for mini chart data (using only accumulated values)
        miniEmaFast = calculateMiniEMA(miniData.map(d => d.accumulatedValue), miniEmaFastPeriod);
        miniEmaSlow = calculateMiniEMA(miniData.map(d => d.accumulatedValue), miniEmaSlowPeriod);
        updateMiniChart();
    }

    // New function to remove data from mini chart
    function removeMiniChartData() {
        if (miniData.length > 0) {
            miniData.pop(); // Remove the last point object
            miniAccumulatedValue = miniData.length > 0 ? miniData[miniData.length - 1].accumulatedValue : 0;
            // Recalculate EMAs for mini chart data (using only accumulated values)
            miniEmaFast = calculateMiniEMA(miniData.map(d => d.accumulatedValue), miniEmaFastPeriod);
            miniEmaSlow = calculateMiniEMA(miniData.map(d => d.accumulatedValue), miniEmaSlowPeriod);
            updateMiniChart();
        }
    }

    // Expose functions to the main script.js
    window.addMiniChartData = addMiniChartData;
    window.removeMiniChartData = removeMiniChartData; // Expose removeMiniChartData
    window.resetMiniChart = () => { // Expose reset function
        miniData = [];
        miniAccumulatedValue = 0;
        miniSupports = []; // Reset supports
        miniResistances = []; // Reset resistances
        miniEmaFast = [];
        miniEmaSlow = [];
        currentMiniZoomLevel = 0; // Reset mini chart zoom level
        clearMiniFibonacci(); // Clear mini Fibonacci on reset
        updateMiniChart();
    };

    // New: Function to set mini chart's zoom level
    window.setMiniChartZoom = (zoomLevel) => {
        currentMiniZoomLevel = zoomLevel;
        updateMiniChart();
    };

    // Expose mini chart data and calculation functions for main script
    window.getMiniChartLastDataPoint = () => miniData.length > 0 ? miniData[miniData.length - 1].accumulatedValue : undefined;
    window.getMiniChartSupports = () => miniSupports;
    window.getMiniChartResistances = () => miniResistances;
    window.getMiniChartTrend = getMiniChartTrend;
    window.getMiniChartMomentum = getMiniChartMomentum;
    window.getMiniChartAverageRange = getMiniChartAverageRange;

    // Expose mini Fibonacci functions for main script
    window.toggleMiniFibonacci = () => {
        if (miniFibonacciState === 'inactive') {
            clearMiniFibonacci(); // Clear any leftovers just in case
            miniFibonacciState = 'selecting';
            miniFibonacciPoints = [];
            miniSvg.style('cursor', 'crosshair');
            miniSvg.on('click', handleMiniFibonacciClick);
            console.log("Mini Fibonacci: Select the first point (100%) on the mini chart.");
        } else {
            clearMiniFibonacci();
            console.log("Mini Fibonacci: Deactivated.");
        }
    };
    // Expose mini chart's fibonacci state
    Object.defineProperty(window, 'miniFibonacciState', {
        get: () => miniFibonacciState,
        configurable: true
    });

    // New: Expose resize function for the mini chart
    window.resizeMiniChart = () => {
        // Recalculate dimensions from its container
        miniWidth = miniChartContainer.offsetWidth;
        miniHeight = miniChartContainer.offsetHeight;
        miniInnerWidth = miniWidth - miniMargin.left - miniMargin.right;
        miniInnerHeight = miniHeight - miniMargin.top - miniMargin.bottom;

        // Update scales based on new dimensions
        miniXScale.range([miniMargin.left, miniWidth - miniMargin.right]);
        miniYScale.range([miniHeight - miniMargin.bottom, miniMargin.top]);

        // Redraw the mini chart
        updateMiniChart();
    };

    // Initial draw with empty data - now calls updateMiniChart directly as miniData is initialized here
    window.resizeMiniChart(); // Initial call to set up dimensions and draw
});