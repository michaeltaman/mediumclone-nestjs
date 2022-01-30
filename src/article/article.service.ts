import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ArticleEntity } from '@app/article/article.entity';
import { getRepository, Repository } from 'typeorm';
import { CreateArticleDto } from '@app/article/dto/createArticle.dto';
import { UserEntity } from '@app/user/user.entity';
import { ArticleResponseInterface } from '@app/article/types/articleResponse.interface';
import { ArticlesResponseInterface } from '@app/article/types/articlesResponse.interface';
import slugify from 'slugify';
import { DeleteResult } from 'typeorm/query-builder/result/DeleteResult';

@Injectable()
export class ArticleService {
  constructor(
    @InjectRepository(ArticleEntity)
    private readonly articleRepository: Repository<ArticleEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
  ) {}

  async findAll(
    currentUserId: number,
    query: any,
  ): Promise<ArticlesResponseInterface> {
    const queryBuilder = getRepository(ArticleEntity)
      .createQueryBuilder('articles')
      .leftJoinAndSelect('articles.author', 'author');

    queryBuilder.orderBy('articles.createdAt', 'ASC');

    if (query.tag) {
      queryBuilder.andWhere('articles.tagList LIKE :tag', {
        tag: `%${query.tag}%`,
      });
    }

    if (query.author) {
      const author = await this.userRepository.findOne({
        username: query.author,
      });

      console.log('author', author);
      queryBuilder.andWhere('articles.authorId = :id', {
        id: author.id,
      });
    }

    if (query.favorited) {
      const articles = await this.userRepository.findOne(
        { username: query.favorited },
        { relations: ['favorites'] },
      );

      const ids = articles.favorites.map((el) => el.id);

      if (ids.length > 0) {
        //console.log('ids', ids);
        //console.log('author', articles);
        queryBuilder.andWhere('articles.id IN (:...ids)', {
          ids,
        });
      } else {
        queryBuilder.andWhere('1=0'); // return empty array
      }
    }

    if (query.limit) {
      queryBuilder.limit(query.limit);
    }

    if (query.offset) {
      queryBuilder.offset(query.offset);
    }

    let favoriteIds: number[] = [];
    if (currentUserId) {
      const currentUserFavoriteArticles = await this.userRepository.findOne(
        { id: currentUserId },
        { relations: ['favorites'] },
      );

      favoriteIds = currentUserFavoriteArticles.favorites.map(
        (favorite) => favorite.id,
      );
    }

    // Adds favorited = false/true for every article of current user
    // Does current user favorited an article ?
    const articles = await queryBuilder.getMany();
    const articlesWithFavorited = articles.map((article) => {
      const favorited: boolean = favoriteIds.includes(article.id);
      return { ...article, favorited };
    });
    const articlesCount = await queryBuilder.getCount();

    return { articles: articlesWithFavorited, articlesCount };
  }

  async createArticle(
    currentUser: UserEntity,
    createArticleDto: CreateArticleDto,
  ): Promise<ArticleEntity> {
    const article = new ArticleEntity();
    Object.assign(article, createArticleDto);
    /////console.log('article ', article);
    if (!article.tagList) {
      article.tagList = [];
    }
    article.slug = this.getSlug(createArticleDto.title);
    article.author = currentUser;
    return await this.articleRepository.save(article);
  }

  buildArticleResponse(article: ArticleEntity): ArticleResponseInterface {
    return { article };
  }

  private getSlug(title: string): string {
    return (
      slugify(title, { lower: true }) +
      '-' +
      ((Math.random() * Math.pow(36, 6)) | 0).toString(36)
    );
  }

  async findBySlug(slug: string): Promise<ArticleEntity> {
    const articleBySlug = await this.articleRepository.findOne({
      slug: slug,
    });

    if (!articleBySlug) {
      throw new HttpException('Article doe not exist', HttpStatus.NOT_FOUND); //404
    }

    return articleBySlug;
  }

  async deleteArticle(
    slug: string,
    currentUserId: number,
  ): Promise<DeleteResult> {
    const article = await this.findBySlug(slug);
    if (article.author.id !== currentUserId) {
      throw new HttpException('You are not an author', HttpStatus.FORBIDDEN); //403
    }
    return await this.articleRepository.delete({
      slug: slug,
    });
  }

  async updateArticle(
    slug: string,
    currentUserId: number,
    updateArticleDto: CreateArticleDto,
  ): Promise<ArticleEntity> {
    const article: ArticleEntity = await this.findBySlug(slug);
    if (article.author.id !== currentUserId) {
      throw new HttpException('You are not an author', HttpStatus.FORBIDDEN); //403
    }
    Object.assign(article, updateArticleDto);
    return await this.articleRepository.save(article);
  }

  async addArticleToFavorites(
    slug: string,
    userId: number,
  ): Promise<ArticleEntity> {
    const article: ArticleEntity = await this.findBySlug(slug);
    const user = await this.userRepository.findOne(userId, {
      relations: ['favorites'],
    });

    /////console.log('user', user);
    // The user (UserEntity) in favorites will contane array related to it ArticleEntities
    // because see above  relations: ['favorites'].

    //Pay attention 'favoritesCount' - will contain likes counter received from different users

    const isNotFavorited =
      user.favorites.findIndex(
        (articleInFavorites) => articleInFavorites.id === article.id,
      ) === -1;

    if (isNotFavorited) {
      user.favorites.push(article);
      article.favoritesCount++;
    }
    await this.userRepository.save(user);
    await this.articleRepository.save(article);
    return article;
  }

  async deleteArticleFromFavorites(
    slug: string,
    userId: number,
  ): Promise<ArticleEntity> {
    const article: ArticleEntity = await this.findBySlug(slug);

    //try to find the article in the 'users' - table
    const user = await this.userRepository.findOne(userId, {
      relations: ['favorites'],
    });

    //attempt to find the article in 'users_favorites_articles' - table
    const articleIndex = user.favorites.findIndex(
      (articleInFavorites) => articleInFavorites.id === article.id,
    );

    //Do nothing in case of an article that was not previously approved by the user
    if (articleIndex >= 0) {
      user.favorites.splice(articleIndex, 1);
      article.favoritesCount--;
      await this.userRepository.save(user);
      await this.articleRepository.save(article);
    }
    return article;
  }
}
