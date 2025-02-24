
# Movie Recommendation Tool

The purpose of this tool is to suggest one movie recommendation based on a chosen movie from the library. It was built using [Vite](https://vite.dev/), [Typescript](https://www.typescriptlang.org/) and basic [HTML5](https://html.spec.whatwg.org/multipage/) and [CSS3](https://www.w3.org/Style/CSS/).

## How To Set Up The Tool

Since the app was created using Vite, you can simply open a command prompt terminal at the root of the project and launch the npm command below to install the dependencies.

```bash
  npm install
```

After the installation finishes, you can run the command below, which will provide you with a local server accessible through [localhost:5173](http://localhost:5173/) (Vite default port).

```bash
  npm run dev
```

The reason behind the choice of using a local development server is that we can serve our typescript files so that they can be executed as modules by browsers. We don't want them to get mistaken for other MIME types, or blocked by CORS security restrictions. And most importantly, a local server would be needed for HTTP requests, like the ones we have implemented in our source code.

## How To Use The Tool

Once the UI finishes loading, you can use the text input at the top left to search for a movie by its name. Once the search has been submitted, the results, if there's any, will be shown below the input, sorted alphabetically. If you submit another search, its results would override the previous ones.

Once you find the movie your searching for, you can click on it to display the result of the best recommended movie, based on the movie you chose. The result will be shown in the form of a table displaying the two movies metadata, in order to make the user find similarities between the chosen one and the one suggested, and decide if the latter is a good match for what it is looking for.

The search input will still be visible, so if you submit some other text the tool will prompt you back to show the new results, deleting the recommendation it just displayed.

## Understanding How The Tool Was Built

The tool has encountered and overcame challenges regarding performance, memory and data.

### Loading the dataset

The dataset contains approximately 85K entries, you can find it under `src/data/metadata_updated.json`, which is loaded directly via the `fetch` method, succeeded by the `text` method of the `Response` interface, if resolved of course, to finally resolve the `json` file to a `string`.

Since the `json` file consists of a movie object per line, we are splitting the text result by line breaks (`\n`) and parsing every line to an object recognizable for better manipulations afterward.

### Creating the vector database

**N.B**: It is now the time to unveil that for the first version of this tool, the search will be two-dimensional, based on basic metadata. We chose the director of the movie and the average Imdb rating as our first two dimensions. The tool is of course capable to support more dimensions in future versions. It is important to note that the purpose of this first version is to show a working minimal example of how the app is running.

#### Vector database creation

The first step to creating a vector database is to understand how a vector is going to be created based on our dataset. The two criteria we chose are different in type, one is categorical (The movie director), and the other one is quantitative (The average rating). Since a vector is a representation of k number of points in a k-dimensional space, and every point should represent a numerical value, one of the challenges encountered was to be able to represent a categorical value as a numeric one, while keeping the equality of influence on the recommendation between all the criteria. For this situation, we opted for a type of encoding called `Target Encoding`.

The latter consists of making a categorical criteria be represented by the mean of a target one, hence the naming. This makes it easier to assign numeric values to categorical variables, and helps in the process of data normalization.

The latter is another challenge faced by the app, since a lot of movie criteria can be measured/defined on different scales, this consequently makes the variables have different values that can be far from each other. This can produce errors in results, since some criteria can be more influential than other ones.

As a first step towards `Target Encoding`, the script creates a map of directors, consisting of every unique director that exists in the dataset, along with its number of occurrences in the set, and the total of its movie ratings.

The script then proceeds to create a vector for each movie, which can be simply an array of numeric values ([x, y]), where each element represents a criteria. We chose 'x' point as the one representing the value assigned for the "director", and the 'y' will be occupied by the one assigned to the "average rating". Since we are normalizing the vector, and consequently turning them to unit vector, we are using the min-max normalization for the ratings, since they are measured on a scale from zero to five.

We chose exactly four columns for our vector database, the first two would be the id of the movie, and its title. They are useful for easier search and access through the database. the 3rd one would be the vector itself, and the fourth one will be the magnitude of the vector. The magnitude is the length of the vector, it is a very important factor for the calculation of the similarity between vectors. We chose to precompute the magnitude so that we could easily access them once the search for the best suggestion begins. Also, the complexity of the magnitude calculation of a single vector is O(n), with n is the number of dimensions, so if n gets bigger, the calculation would take more time, making it more difficult to return a suggestion in an optimal time. So to summarize, it's better not to jeopardize our search for the best suggestion by adding more complex operations that can be processed at better moments.

Since the dataset is too large, we decided to process creating vectors in chunks of a fixed number of elements (e.g: 5000), and asynchronously program the next batch. This method prevents memory bloat.

#### Search for the best movie suggestion

In order for the app to be efficient, and to return results in milliseconds, it's important to choose a powerful method with a low complexity. Like suggested, the script tries to look for the best movie suggestion using the [KDTree representation](https://blog.hawk-tech.io/optimiser-la-recherche-spatiale-avec-les-kd-tree-64612f14fe68) along with its nearest neighbor search algorithm.

The KDTree is loyal to its name, it's a tree that starts with a root node, which has a left node and a right one, and each one of these have its own left and right nodes, etc... Every node represents a point in a K-dimensional space, and the latter is partitioned into two halves recursively according to one dimension at a time. every node has value called nodeV, its left and right nodes are respectively called lNodeV and rNodeV, and at a certain dimension called 'd', nodeV[d] > lNodeV[d], and nodeV[d] < rNodeV[d]. This representation is useful for search operations, since it helps to avoid browsing all the elements of the dataset to find the perfect match. Instead, it narrows down the search by orienting it at every iteration to the closest point to the target one at a given dimension, or what we call her, depth. So the complexity of the search gets to O(log(n)), instead of O(n).

The app tries to use the nearest neighbor search in an efficient way. It first starts with the root node, which represents the splitting point at the first dimension, which represents the values for the directors. At this point, this is the best match we have. The idea is to decide whether it goes to the left subtree, or the right one. Since we are at the first node, then the depth is still 0. Let's call our target node, meaning the node we are looking for its nearest neighbor, tNode. If tNodeV[0] < nodeV[0], then we go left, else we go right.

Mathematically speaking, even though we opted for one node, it doesn't mean that the other is not closer, it just means that on that specific dimension, the points are not close. To find out whether we need to explore the other subtree, we calculate the distance between the target node and the other node, by subtracting [the cosine similarity](https://www.geeksforgeeks.org/cosine-similarity/) result of the two node values (vectors) from 1.
Then, we verify that this distance is less than the difference between the values of tNodeV[0] and nodeV[0].

Every chosen node gets pushed to a queue, and this queue is always sorted from the closest to the farthest traversed node. At the next iteration, we draw the first element of the queue, and we increment the depth, so that we can match the dimension that node split when we were creating the tree. We calculate the distance between it and the target node, using the cosine similarity again, and if this node turns out to be closer, we override the last one. At every iteration, we ensure that the depth doesn't exceed the number of dimensions by cycling it using the modulo '%' operation. The search ends when we arrive at the bottom of the tree (Which is ironically its top).

## Next Versions Features

- Expanding the dimensionality to support more search criteria.
- Opting for Euclidean similarity since the dimensionality is not high (So far).
- Favouring categorical criteria over quantitative ones for better suggestions.