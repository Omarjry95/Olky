import {KDNode, KDNodeDistance} from "./models/KDNode.ts";
import {BATCH_SIZE, RESULTS_PANEL_ID} from "./constants";
import {VectorMetadata, VectorModel} from "./models/VectorModel.ts";
import {TargetEncodingModel} from "./models/TargetEncodingModel.ts";

let movies: any[] = [];

let directorsMap: Record<string, TargetEncodingModel> = {};

let totalDimensions = 0;

let vectorDatabase: VectorModel[] = [];

let kDTree: KDNode | null = null;

let batchStartIndex: number = 0;

export function recommendMovie(id: number): void {
  console.log(`Looking for the best recommendation for the movie: ${id}`);

  toggleResultsDisplay([]);

  setTimeout(() => {
    const startAt = performance.now();

    const movie: VectorModel | undefined = selectMovieById(id);

    if (!movie) {
      console.error(`No movie found for the id: ${id}`);
      return;
    }

    const nearestNeighbor: KDNode | null = nearestNeighborSearch(kDTree, movie);

    if (nearestNeighbor) {
      console.log(`Recommending movie ${nearestNeighbor.id} after ${performance.now() - startAt} ms`);

      const moviesAsResults = [movie.id, nearestNeighbor.id]
        .map(id => movies.find(m => m.item_id === id));

      if (moviesAsResults.every(m => m)) {
        moviesAsResults.forEach((m) => {
          if (m.title) {
            const title = m.title as string;
            const regexMatches = title.match(/\(([^)]+)\)/g);

            if (regexMatches) {
              const lastMatch = regexMatches[regexMatches.length - 1];
              m.title = title.substring(0, title.lastIndexOf(lastMatch));
              m.year = lastMatch.substring(1, lastMatch.length - 1);
            }
          }

          m.starring = (m.starring as string).replace(/(,)/g, (match) => `${match} `);
        })

        toggleRecommendationResults(...moviesAsResults);
        return;
      }
    }

    console.error(`No movie to recommend for the id: ${movie.id}`);
  }, 0);
}

export function toggleRecommendationResults(...moviesAsResults: any[]): void {
  const recommendationDiv: HTMLDivElement = document.getElementById("recommendation") as HTMLDivElement;

  if (moviesAsResults.length > 0) {
    recommendationDiv.style.display = "flex";

    populateTable(moviesAsResults, 'title', 'title', true);
    populateTable(moviesAsResults, 'year', 'year');
    populateTable(moviesAsResults, 'directedBy', 'director');
    populateTable(moviesAsResults, 'starring', 'actors');
    populateTable(moviesAsResults, 'avgRating', 'rating');
    return;
  }

  recommendationDiv.style.display = "none";
}

export function populateTable(results: any[], prop: string, id: string, isHeader: boolean = false) {
  const row: HTMLDivElement = document.getElementById(`movie-${id}`) as HTMLDivElement;

  for (let i = 0; i < results.length; i++) {
    const cell = document.createElement(isHeader ? "th": "td");
    cell.textContent = results[i][prop];
    row.appendChild(cell);
  }

  if (isHeader) {
    row.insertBefore(document.createElement("th"), row.firstChild);
  }
}

export function toggleResultsDisplay(searchResults: VectorMetadata[]): void {
  toggleRecommendationResults();

  const resultsDiv: HTMLDivElement = document.getElementById("results") as HTMLDivElement;

  if (searchResults.length > 0) {
    resultsDiv.style.display = "flex";

    const resultsPanel = document.createElement("div");
    resultsPanel.id = RESULTS_PANEL_ID;

    searchResults.forEach(({ id, name }) => {
      let resultButton = document.createElement("button");
      resultButton.id = "movie-result-".concat(String(id));
      resultButton.type = "button";
      resultButton.textContent = name;
      resultButton.addEventListener("click", () => recommendMovie(id))
      resultsPanel.appendChild(resultButton);
    });

    resultsDiv.appendChild(resultsPanel);

    return;
  }

  const resultsPanel: HTMLDivElement = document.getElementById(RESULTS_PANEL_ID) as HTMLDivElement;
  if (resultsPanel) {
    resultsPanel.remove();
  }

  if (resultsDiv) {
    resultsDiv.style.display = "none";
  }
}

export function prepareListeners(): void {
  document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("search-form");

    if (form) {
      form.addEventListener("submit", searchMovies);
    }
  });
}

export function searchMovies(event: SubmitEvent) : void {
  event.preventDefault();

  toggleResultsDisplay([]);

  const searchInput: HTMLInputElement = document.getElementById("search") as HTMLInputElement;
  let searchValue = searchInput.value;
  console.log(`Looking for a movie with the name ${searchValue}`);

  if (searchValue) {
    const searchResults: VectorMetadata[] = selectMoviesByNameContains(searchValue)
      .map(({ id, name }) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));

    console.log(`${searchResults.length} results found.`);

    toggleResultsDisplay(searchResults);
  }
}

export function selectMovieById(id: number) : VectorModel | undefined {
  return vectorDatabase.find(
    ({ id: vectorId }) => vectorId === id
  );
}

export function selectMoviesByNameContains(subString: string) : VectorModel[] {
  subString = subString.trim().toLowerCase();

  return vectorDatabase.filter(
    ({ name }) => name.toLowerCase().includes(subString)
  )
}

export async function loadDataset(): Promise<void> {
  console.log('loading dataset !');

  let datasetAsText: string = '';

  try {
    const response = await fetch('src/data/metadata_updated.json');

    datasetAsText = await response.text();
  } catch (error) {
    console.error(
      'An error has occured while loading/processing your json library: ',
      error)
  }

  movies = datasetAsText.split('\n')
    .filter(line => line.trim().length > 0)
    .map(line => JSON.parse(line));

  console.log(`dataset loaded with ${movies.length} entries !`);
}

export function calculateDimensions(): void {
  const directorNumOfDimensions = 1;
  const ratingNumOfDimensions = 1;
  totalDimensions = directorNumOfDimensions + ratingNumOfDimensions;

  console.log(`total number of dimensions: ${totalDimensions}`);
}

export function createMap(key: string, map: Record<string, TargetEncodingModel>): Record<string, TargetEncodingModel> {
  console.log(`creating map with ${key} key`);

  for (let i = 0; i < movies.length; i++) {
    if (!map.hasOwnProperty(movies[i].directedBy)) {
      map[movies[i].directedBy] = { total: normalize(movies[i], 'avgRating', 5), numOcc: 1 };
      continue;
    }

    map[movies[i].directedBy].total += normalize(movies[i], 'avgRating', 5);
    map[movies[i].directedBy].numOcc += 1;
  }

  return map;
}

export function normalize(movie: any, key: string, normalizeOn: number) {
  return movie[key] / normalizeOn;
}

export function createMovieVector(movie: any): Float32Array {
  let vector = new Float32Array(totalDimensions);

  vector[0] = directorsMap[movie.directedBy].total / directorsMap[movie.directedBy].numOcc;
  vector[1] = normalize(movie, 'avgRating', 5);

  return vector;
}

export function createVectorDatabase(processStartedAt: number) {
  const startAt = performance.now();

  for (let i = 0; i < BATCH_SIZE && batchStartIndex < movies.length; i++, batchStartIndex++) {
    const movie = movies[batchStartIndex];
    const vector = createMovieVector(movie);

    vectorDatabase.push({
      id: movie.item_id,
      magnitude: Math.sqrt(accumulateVectorsProducts(vector)),
      name: movie.title,
      vector
    });
  }

  console.log(`Processed ${batchStartIndex} / ${movies.length} movies in ${performance.now() - startAt} ms`);

  if (batchStartIndex < movies.length) {
    setTimeout(() => createVectorDatabase(processStartedAt), 0);
    return;
  }

  console.log(`vector database created after ${performance.now() - processStartedAt} ms !`);

  console.log('creating K-D Tree !');

  const growingTreeStartAt = performance.now();
  kDTree = growKDTree(vectorDatabase, 0);
  console.log(`K-D Tree created in ${performance.now() - growingTreeStartAt} ms`);
}

export async function convertMoviesToVectors(): Promise<void> {
  await loadDataset();

  directorsMap = createMap('directedBy', directorsMap);
  console.log(`map of directors created with ${Object.keys(directorsMap).length} different entries !`);

  calculateDimensions();

  console.log('creating vector database !');
  createVectorDatabase(performance.now());
}

export function growKDTree(movies: VectorModel[], depth: number): KDNode | null {
  if (movies.length === 0) {
    return null;
  }

  const axis = depth % movies[0].vector.length;
  movies.sort((a, b) => a.vector[axis] - b.vector[axis]);
  const medianIndex = Math.floor(movies.length / 2);

  const { name, ...rest } = movies[medianIndex];

  return {
    ...rest,
    rightNode: growKDTree(movies.slice(medianIndex + 1), depth + 1),
    leftNode: growKDTree(movies.slice(0, medianIndex), depth + 1),
  };
}

export function nearestNeighborSearch(node: KDNode | null, targetMovie: VectorModel): KDNode | null {
  if (!node) {
    return null;
  }

  let priorityQueue: KDNodeDistance[] = [{ node, distance: 0, depth: 0 }];
  let bestSuggestion: KDNodeDistance = { node: null, distance: Infinity, depth: 0 };

  while (priorityQueue.length > 0) {
    let nextNode = priorityQueue.shift();

    if (!nextNode) {
      continue;
    }

    if (!nextNode.node) {
      continue;
    }

    if (nextNode.node.id === targetMovie.id) {
      continue;
    }

    const cosineSimilarity = getCosineSimilarity(targetMovie.vector, nextNode.node.vector,
      targetMovie.magnitude, nextNode.node.magnitude);
    const distance = 1 - cosineSimilarity;

    if (distance < bestSuggestion.distance) {
      bestSuggestion.node = nextNode.node;
      bestSuggestion.distance = distance;
    }

    let depth = nextNode.depth % targetMovie.vector.length;

    const nextBranch = targetMovie.vector[depth] < nextNode.node.vector[depth] ?
      nextNode.node.leftNode : nextNode.node.rightNode;
    const otherBranch = targetMovie.vector[depth] < nextNode.node.vector[depth] ?
      nextNode.node.rightNode : nextNode.node.leftNode;
    const vectorDistance = Math.abs(targetMovie.vector[depth] - nextNode.node.vector[depth]);

    if (nextBranch) {
      priorityQueue.push({ node: nextBranch, distance: vectorDistance, depth: depth + 1 });
    }

    if (otherBranch && (vectorDistance < bestSuggestion.distance)) {
      priorityQueue.push({ node: otherBranch, distance: vectorDistance, depth: depth + 1 });
    }

    priorityQueue.sort((a, b) => a.distance - b.distance);
  }

  return bestSuggestion.node;
}

export function accumulateVectorsProducts(v1: Float32Array, v2?: Float32Array): number {
  let acc = 0;

  for (let i = 0; i < v1.length; i++) {
    acc += v1[i] * (v2 ? v2[i] : v1[i]);
  }

  return acc;
}

export function getCosineSimilarity(movie1Vector: Float32Array, movie2Vector: Float32Array,
                                    movie1Magnitude: number, movie2Magnitude: number): number {
  return accumulateVectorsProducts(movie1Vector, movie2Vector) / (movie1Magnitude * movie2Magnitude);
}

prepareListeners();
convertMoviesToVectors();